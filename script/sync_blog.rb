#!/usr/bin/env ruby
# frozen_string_literal: true

require "cgi"
require "json"
require "net/http"
require "rexml/document"
require "tempfile"
require "time"
require "timeout"
require "uri"

module BlogSync
  FEED_URL = URI("https://blog.lesis.lat/feed.xml")
  BLOG_HOST = "blog.lesis.lat"
  LANGUAGES = %w[en pt es].freeze
  OUTPUT_PATH = File.expand_path("../_data/blog.json", __dir__)
  SUMMARY_LENGTH = 220
  ATOM = { "atom" => "http://www.w3.org/2005/Atom" }.freeze

  class Error < StandardError; end

  module_function

  def fetch_feed(uri = FEED_URL)
    response = Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: 10, read_timeout: 30) do |http|
      http.request(Net::HTTP::Get.new(uri))
    end
    raise Error, "Blog feed returned HTTP #{response.code}; no blog data was changed." unless response.is_a?(Net::HTTPSuccess)

    response.body
  end

  def parse(xml)
    document = REXML::Document.new(xml)
    REXML::XPath.match(document, "/atom:feed/atom:entry", ATOM).filter_map { |entry| normalize(entry) }
  rescue REXML::ParseException
    raise Error, "Blog feed is not valid XML; no blog data was changed."
  end

  def normalize(entry)
    language = entry.attributes["xml:lang"]
    return unless LANGUAGES.include?(language)

    url = blog_url(REXML::XPath.first(entry, "atom:link[@rel='alternate']/@href", ATOM)&.value)
    title = clean_text(text_of(entry, "atom:title"))
    date = normalize_date(text_of(entry, "atom:published"))
    return if url.nil? || title.empty? || date.nil?

    {
      "title" => title,
      "lang" => language,
      "url" => url,
      "date" => date,
      "topic" => clean_text(REXML::XPath.first(entry, "atom:category/@term", ATOM)&.value),
      "summary" => truncate(clean_text(text_of(entry, "atom:summary")), SUMMARY_LENGTH)
    }
  end

  def text_of(entry, path)
    REXML::XPath.first(entry, path, ATOM)&.text.to_s
  end

  def blog_url(value)
    uri = URI.parse(value.to_s)
    return unless uri.is_a?(URI::HTTPS) && uri.host == BLOG_HOST

    uri.to_s
  rescue URI::InvalidURIError
    nil
  end

  def normalize_date(value)
    Time.iso8601(value).utc.strftime("%Y-%m-%d")
  rescue ArgumentError
    nil
  end

  def clean_text(value)
    CGI.unescapeHTML(value.to_s.gsub(/<[^>]*>/, " ")).gsub(/\s+/, " ").strip
  end

  def truncate(text, limit)
    return text if text.length <= limit

    cut = text[0, limit].sub(/\s+\S*\z/, "")
    "#{cut.sub(/[\s.,;:]+\z/, '')}…"
  end

  def sort_posts(posts)
    posts.uniq { |post| post["url"] }.sort_by { |post| [post["date"], post["title"]] }.reverse
  end

  def atomic_write(path, content)
    Tempfile.create(["blog", ".json"], File.dirname(path)) do |temporary|
      temporary.write(content)
      temporary.flush
      temporary.fsync
      File.chmod(0o644, temporary.path)
      temporary.close
      File.rename(temporary.path, path)
    end
  end

  def run(xml: nil, data_path: OUTPUT_PATH)
    posts = sort_posts(parse(xml || fetch_feed))
    missing = LANGUAGES.reject { |language| posts.any? { |post| post["lang"] == language } }
    raise Error, "Blog feed has no #{missing.join(', ')} posts; no blog data was changed." unless missing.empty?

    atomic_write(data_path, "#{JSON.pretty_generate(posts)}\n")
    counts = LANGUAGES.map { |language| "#{posts.count { |post| post['lang'] == language }} #{language}" }
    puts "Synced #{counts.join(', ')} blog posts from #{FEED_URL}."
  rescue SystemCallError, SocketError, Timeout::Error, OpenSSL::SSL::SSLError => e
    raise Error, "Blog sync failed (#{e.class}). Existing blog data was preserved."
  end
end

if $PROGRAM_NAME == __FILE__
  begin
    BlogSync.run
  rescue BlogSync::Error => e
    warn "Error: #{e.message}"
    exit 1
  end
end
