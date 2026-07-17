#!/usr/bin/env ruby
# frozen_string_literal: true

require "cgi"
require "fileutils"
require "json"
require "net/http"
require "sanitize"
require "tempfile"
require "time"
require "timeout"
require "uri"
require "yaml"

module NewsletterSync
  API_URL = URI("https://api.kit.com/v4/broadcasts")
  OUTPUT_PATH = File.expand_path("../_data/newsletters.json", __dir__)
  COLLECTION_DIR = File.expand_path("../_newsletters", __dir__)
  EXCERPT_LENGTH = 320
  SANITIZE_CONFIG = {
    elements: %w[a b blockquote br code em h1 h2 h3 h4 h5 h6 hr i img li ol p pre strong u ul],
    attributes: {
      "a" => %w[href title],
      "img" => %w[alt height src title width]
    },
    protocols: {
      "a" => { "href" => ["https", "mailto", :relative] },
      "img" => { "src" => ["https", :relative] }
    },
    remove_contents: %w[audio button embed form iframe input math object script select style svg template textarea video]
  }.freeze
  HTML_ENTITIES = {
    "nbsp" => " ",
    "ensp" => " ",
    "emsp" => " ",
    "ndash" => "–",
    "mdash" => "—",
    "lsquo" => "‘",
    "rsquo" => "’",
    "ldquo" => "“",
    "rdquo" => "”",
    "hellip" => "…",
    "bull" => "•",
    "middot" => "·"
  }.freeze

  class Error < StandardError; end

  class KitClient
    def initialize(api_key, requester: nil)
      @api_key = api_key
      @requester = requester || method(:perform_request)
    end

    def broadcasts
      broadcasts = []
      cursor = nil
      seen_cursors = {}

      loop do
        uri = page_uri(cursor)
        response = @requester.call(uri, @api_key)
        payload = parse_response(response)

        page = payload["broadcasts"]
        pagination = payload["pagination"]
        unless page.is_a?(Array) && pagination.is_a?(Hash)
          raise Error, "Kit returned an invalid broadcasts response. Existing newsletter data was preserved."
        end

        broadcasts.concat(page)
        break unless pagination["has_next_page"] == true

        cursor = pagination["end_cursor"]
        if !cursor.is_a?(String) || cursor.empty? || seen_cursors[cursor]
          raise Error, "Kit returned an invalid pagination cursor. Existing newsletter data was preserved."
        end

        seen_cursors[cursor] = true
      end

      broadcasts
    end

    private

    def page_uri(cursor)
      params = { "per_page" => "1000", "status" => "completed" }
      params["after"] = cursor if cursor

      uri = API_URL.dup
      uri.query = URI.encode_www_form(params)
      uri
    end

    def perform_request(uri, api_key)
      request = Net::HTTP::Get.new(uri)
      request["Accept"] = "application/json"
      request["User-Agent"] = "LESIS newsletter sync"
      request["X-Kit-Api-Key"] = api_key

      Net::HTTP.start(
        uri.host,
        uri.port,
        use_ssl: true,
        open_timeout: 10,
        read_timeout: 30
      ) { |http| http.request(request) }
    end

    def parse_response(response)
      code = response.code.to_i
      case code
      when 200
        JSON.parse(response.body)
      when 401
        raise Error, "Kit authentication failed. Check the KIT_API_KEY secret. Existing newsletter data was preserved."
      when 403
        raise Error, "Kit rejected access to broadcasts. Check the API key permissions. Existing newsletter data was preserved."
      when 429
        raise Error, "Kit rate-limited the newsletter sync. Existing newsletter data was preserved."
      else
        raise Error, "Kit API request failed with HTTP #{code}. Existing newsletter data was preserved."
      end
    rescue JSON::ParserError
      raise Error, "Kit returned invalid JSON. Existing newsletter data was preserved."
    end
  end

  module_function

  def normalize(broadcasts)
    seen_ids = {}

    broadcasts.filter_map do |broadcast|
      next unless broadcast.is_a?(Hash)
      next unless broadcast["status"] == "completed"
      next unless broadcast["public"] == true

      id = clean_text(broadcast["id"])
      public_url = valid_web_url(broadcast["public_url"])
      next if id.empty? || seen_ids[id]

      seen_ids[id] = true
      {
        "id" => id,
        "title" => clean_text(broadcast["subject"]),
        "published_at" => normalize_time(broadcast["published_at"]),
        "excerpt" => excerpt_for(broadcast),
        "kit_url" => public_url,
        "content_html" => sanitize_content(
          broadcast["content"],
          base_url: public_url,
          newsletter_title: broadcast["subject"]
        )
      }
    end.sort_by do |newsletter|
      published_at = newsletter["published_at"]
      [published_at.nil? ? 1 : 0, published_at ? -Time.iso8601(published_at).to_i : 0, newsletter["id"]]
    end
  end

  def excerpt_for(broadcast)
    source = [broadcast["description"], broadcast["preview_text"], broadcast["content"]]
      .find { |value| !clean_text(value).empty? }

    truncate(clean_text(source), EXCERPT_LENGTH)
  end

  def clean_text(value)
    text = value.to_s.dup
    text.gsub!(/<script\b[^>]*>.*?<\/script\s*>/im, " ")
    text.gsub!(/<style\b[^>]*>.*?<\/style\s*>/im, " ")
    text.gsub!(/<(?:script|style)\b[^>]*>.*\z/im, " ")
    text.gsub!(/<!--.*?-->/m, " ")
    text.gsub!(/<[^>]*>/m, " ")
    text.gsub!(/&(#{HTML_ENTITIES.keys.join('|')});/i) { HTML_ENTITIES[Regexp.last_match(1).downcase] }
    text = CGI.unescapeHTML(text)
    text.gsub!(/[\u00A0\s]+/, " ")
    text.gsub!(/\s+([.,;:!?])/, '\\1')
    text.strip
  end

  def sanitize_content(value, base_url: nil, newsletter_title: nil)
    sanitized = Sanitize.fragment(value.to_s, SANITIZE_CONFIG)
    fragment = Nokogiri::HTML5.fragment(sanitized)

    fragment.css("h1").each { |heading| heading.name = "h2" }
    fragment.css("a").each { |link| secure_link(link, base_url) }
    fragment.css("img").each { |image| secure_image(image, base_url) }
    remove_kit_template_chrome(fragment, newsletter_title)

    neutralize_liquid(fragment.to_html.strip)
  end

  def remove_kit_template_chrome(fragment, newsletter_title)
    remove_kit_header(fragment, newsletter_title)
    remove_kit_footer(fragment)
  end

  def remove_kit_header(fragment, newsletter_title)
    first_heading = fragment.xpath("./h2 | ./h3 | ./h4 | ./h5 | ./h6").first
    return unless first_heading

    preceding = first_heading.xpath("preceding-sibling::*")
    return if preceding.empty? || preceding.first.name != "img"

    heading_text = clean_text(preceding.map(&:text).join(" "))
    expected_title = clean_text(newsletter_title)
    displayed_title = preceding
      .select { |node| node.name == "p" }
      .map { |node| clean_text(node.text) }
      .find { |text| text.match?(/[[:alnum:]]/) }
    title_matches = heading_text.include?(expected_title) ||
      (!displayed_title.to_s.empty? && expected_title.start_with?(displayed_title))
    return if expected_title.empty? || !title_matches

    preceding.each(&:remove)
  end

  def remove_kit_footer(fragment)
    kit_badge = fragment.css("img").find do |image|
      image["alt"].to_s.casecmp("Built with Kit").zero? || image["src"].to_s.include?("kit-badge")
    end
    return unless kit_badge

    footer_start = fragment.xpath("./p").find do |paragraph|
      text = clean_text(paragraph.text)
      text.include?("Unsubscribe") || text.include?("Preferences")
    end
    return unless footer_start

    footer_start.xpath("following-sibling::node()").each(&:remove)
    footer_start.remove
  end

  def secure_link(link, base_url)
    href = resolve_content_url(link["href"], base_url: base_url, allowed_schemes: %w[https mailto], allow_fragment: true)
    unless href
      link.remove_attribute("href")
      return
    end

    link["href"] = href
    uri = URI.parse(href)
    return unless uri.is_a?(URI::HTTPS) && external_host?(uri.host)

    link["target"] = "_blank"
    link["rel"] = "noopener noreferrer"
  end

  def secure_image(image, base_url)
    src = resolve_content_url(image["src"], base_url: base_url, allowed_schemes: ["https"])
    unless src
      image.remove
      return
    end

    image["src"] = src
    image["loading"] = "lazy"
  end

  def resolve_content_url(value, base_url:, allowed_schemes:, allow_fragment: false)
    raw = value.to_s.strip
    return nil if raw.empty?
    return raw if allow_fragment && raw.start_with?("#")

    uri = URI.parse(raw)
    if uri.relative?
      return nil unless base_url

      uri = URI.join(base_url, raw)
    end

    return nil unless allowed_schemes.include?(uri.scheme)
    return nil if uri.scheme == "https" && (uri.host.nil? || uri.host.empty?)

    uri.to_s
  rescue URI::InvalidURIError
    nil
  end

  def external_host?(host)
    host && host != "lesis.lat" && !host.end_with?(".lesis.lat")
  end

  def neutralize_liquid(html)
    html.gsub("{", "&#123;").gsub("}", "&#125;")
  end

  def truncate(text, limit)
    return text if text.length <= limit

    candidate = text[0, limit + 1]
    boundary = candidate.rindex(/\s/)
    shortened = boundary && boundary.positive? ? candidate[0...boundary] : text[0...limit]
    "#{shortened.rstrip}…"
  end

  def normalize_time(value)
    return nil if value.nil? || value.to_s.strip.empty?

    Time.iso8601(value.to_s).utc.iso8601
  rescue ArgumentError
    nil
  end

  def valid_web_url(value)
    uri = URI.parse(value.to_s)
    return nil unless uri.is_a?(URI::HTTPS) && uri.host && !uri.host.empty?

    uri.to_s
  rescue URI::InvalidURIError
    nil
  end

  def load_existing_newsletters(path = OUTPUT_PATH)
    return [] unless File.exist?(path)

    data = JSON.parse(File.read(path))
    unless data.is_a?(Array)
      raise Error, "Existing newsletter data is not a JSON array; no files were changed."
    end

    data
  rescue JSON::ParserError
    raise Error, "Existing newsletter data is invalid JSON; no files were changed."
  end

  def merge_newsletters(fetched, existing)
    existing_by_id = {}
    existing.each do |newsletter|
      next unless newsletter.is_a?(Hash)

      id = clean_text(newsletter["id"])
      next if id.empty? || existing_by_id.key?(id)

      existing_by_id[id] = newsletter
    end

    used_slugs = {}
    existing_by_id.each do |id, newsletter|
      slug = newsletter["slug"].to_s
      used_slugs[slug] ||= id if valid_slug?(slug)
    end

    generated = fetched.map do |newsletter|
      id = newsletter.fetch("id")
      previous = existing_by_id[id]
      slug = preserved_or_new_slug(previous, newsletter, used_slugs)
      entry = {
        "id" => id,
        "title" => newsletter["title"],
        "published_at" => newsletter["published_at"],
        "excerpt" => newsletter["excerpt"],
        "slug" => slug,
        "url" => "/newsletter/#{slug}/",
        "kit_url" => newsletter["kit_url"]
      }

      existing_by_id[id] = entry
      entry.merge("content_html" => newsletter["content_html"])
    end

    [sort_newsletters(existing_by_id.values), generated]
  end

  def preserved_or_new_slug(previous, newsletter, used_slugs)
    previous_slug = previous ? previous["slug"].to_s : ""
    if valid_slug?(previous_slug) && (!used_slugs.key?(previous_slug) || used_slugs[previous_slug] == newsletter["id"])
      used_slugs[previous_slug] = newsletter["id"]
      return previous_slug
    end

    base = slugify(newsletter["title"], newsletter["id"])
    slug = base
    suffix = slugify(newsletter["id"], "edition")
    counter = 2
    while used_slugs.key?(slug) && used_slugs[slug] != newsletter["id"]
      slug = "#{base}-#{suffix}"
      slug = "#{base}-#{suffix}-#{counter}" if used_slugs.key?(slug) && used_slugs[slug] != newsletter["id"]
      counter += 1
    end

    used_slugs[slug] = newsletter["id"]
    slug
  end

  def slugify(value, fallback)
    normalized = clean_text(value).unicode_normalize(:nfkd).gsub(/\p{Mn}/, "").downcase
    slug = normalized.gsub(/[^a-z0-9]+/, "-").gsub(/\A-+|-+\z/, "")
    slug = "newsletter-#{clean_text(fallback).downcase.gsub(/[^a-z0-9]+/, '-')}" if slug.empty?
    slug = slug[0, 80].sub(/-+\z/, "")
    slug.empty? ? "newsletter-edition" : slug
  end

  def valid_slug?(slug)
    slug.match?(/\A[a-z0-9]+(?:-[a-z0-9]+)*\z/)
  end

  def sort_newsletters(newsletters)
    newsletters.sort_by do |newsletter|
      published_at = normalize_time(newsletter["published_at"])
      [published_at.nil? ? 1 : 0, published_at ? -Time.iso8601(published_at).to_i : 0, clean_text(newsletter["id"])]
    end
  end

  def write_outputs(newsletters, generated, data_path: OUTPUT_PATH, collection_dir: COLLECTION_DIR)
    FileUtils.mkdir_p(collection_dir)

    generated.each do |newsletter|
      path = File.join(collection_dir, "#{newsletter.fetch('slug')}.html")
      content = newsletter["content_html"].to_s.strip
      content = existing_document_body(path) if content.empty? && File.exist?(path)
      content = fallback_content(newsletter) if content.empty?
      atomic_write(path, render_document(newsletter, content))
    end

    atomic_write(data_path, "#{JSON.pretty_generate(newsletters)}\n")
  end

  def render_document(newsletter, content)
    newsletter_title = newsletter["title"].to_s.empty? ? "Untitled newsletter" : newsletter["title"]
    front_matter = {
      "layout" => "newsletter",
      "title" => "#{newsletter_title} | LESIS",
      "newsletter_title" => newsletter_title,
      "description" => newsletter["excerpt"],
      "published_at" => newsletter["published_at"],
      "broadcast_id" => newsletter["id"],
      "kit_url" => newsletter["kit_url"],
      "permalink" => newsletter["url"]
    }

    "#{front_matter.to_yaml}---\n\n#{content}\n"
  end

  def existing_document_body(path)
    File.read(path).sub(/\A---\s*\n.*?\n---\s*\n/m, "").strip
  end

  def fallback_content(_newsletter)
    "<p>The full content for this edition is currently unavailable.</p>"
  end

  def atomic_write(path, content)
    directory = File.dirname(path)
    FileUtils.mkdir_p(directory)

    Tempfile.create(["newsletters", ".json"], directory) do |temporary|
      temporary.write(content)
      temporary.flush
      temporary.fsync
      File.chmod(0o644, temporary.path)
      temporary.close
      File.rename(temporary.path, path)
    end
  end

  def run(client: nil, data_path: OUTPUT_PATH, collection_dir: COLLECTION_DIR)
    unless client
      api_key = ENV["KIT_API_KEY"].to_s.strip
      raise Error, "KIT_API_KEY is required; no newsletter data was changed." if api_key.empty?

      client = KitClient.new(api_key)
    end

    fetched = normalize(client.broadcasts)
    newsletters, generated = merge_newsletters(fetched, load_existing_newsletters(data_path))
    write_outputs(newsletters, generated, data_path: data_path, collection_dir: collection_dir)
    puts "Synced #{fetched.length} public newsletter#{fetched.length == 1 ? '' : 's'} from Kit; #{newsletters.length} total preserved."
  rescue SystemCallError, SocketError, Timeout::Error => e
    raise Error, "Newsletter sync failed (#{e.class}). Existing newsletter data was preserved."
  end
end

if $PROGRAM_NAME == __FILE__
  begin
    NewsletterSync.run
  rescue NewsletterSync::Error => e
    warn "Error: #{e.message}"
    exit 1
  end
end
