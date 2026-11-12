# frozen_string_literal: true

require "minitest/autorun"
require_relative "sync_newsletters"

class NewsletterHeadingsTest < Minitest::Test
  def headings(html)
    Nokogiri::HTML5.fragment(NewsletterSync.sanitize_content(html)).css("h1, h2, h3, h4, h5, h6").map do |node|
      [node.name, node.text]
    end
  end

  def test_preserves_section_and_article_hierarchy
    html = "<h2>Introduction</h2><p>Welcome.</p><h1>Highlight</h1>" \
      "<h2>GRIS/UFRJ takes first place</h2><h3>Results</h3>" \
      "<h1>Community</h1><h2>Next event</h2>"
    assert_equal [
      ["h2", "Introduction"], ["h2", "Highlight"],
      ["h3", "GRIS/UFRJ takes first place"], ["h4", "Results"],
      ["h2", "Community"], ["h3", "Next event"]
    ], headings(html)
  end

  def test_keeps_content_without_h1_unchanged
    assert_equal [["h2", "Section"], ["h3", "Article"]],
      headings("<h2>Section</h2><h3>Article</h3>")
  end

  def test_does_not_create_invalid_heading_levels
    assert_equal [["h2", "Section"], ["h6", "Detail"]],
      headings("<h1>Section</h1><h6>Detail</h6>")
  end
end
