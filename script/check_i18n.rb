#!/usr/bin/env ruby
# frozen_string_literal: true

# Checks that every language file in _data/i18n/ has the same keys, list
# lengths and {placeholders} as en.yml, so a string added in one language is
# not left missing (and rendered empty) in another.
#
#   ruby script/check_i18n.rb

require "yaml"

module I18nCheck
  DIR = File.expand_path("../_data/i18n", __dir__)
  REFERENCE = "en"
  PLACEHOLDER = /\{[a-z_]+\}/

  module_function

  def compare(reference, other, path, errors)
    case reference
    when Hash
      return errors << "#{path}: expected a map" unless other.is_a?(Hash)

      (reference.keys - other.keys).each { |key| errors << "#{join(path, key)}: missing" }
      (other.keys - reference.keys).each { |key| errors << "#{join(path, key)}: not in #{REFERENCE}.yml" }
      (reference.keys & other.keys).each { |key| compare(reference[key], other[key], join(path, key), errors) }
    when Array
      return errors << "#{path}: expected a list" unless other.is_a?(Array)
      return errors << "#{path}: #{other.size} items, #{REFERENCE}.yml has #{reference.size}" unless other.size == reference.size

      reference.each_with_index { |item, index| compare(item, other[index], "#{path}[#{index}]", errors) }
    else
      return errors << "#{path}: empty" if other.to_s.strip.empty?

      expected = reference.to_s.scan(PLACEHOLDER).sort
      found = other.to_s.scan(PLACEHOLDER).sort
      errors << "#{path}: placeholders #{found.inspect}, expected #{expected.inspect}" unless expected == found
    end
    errors
  end

  def join(path, key)
    path.empty? ? key.to_s : "#{path}.#{key}"
  end

  def run
    reference = YAML.safe_load_file(File.join(DIR, "#{REFERENCE}.yml"))
    failed = false
    Dir[File.join(DIR, "*.yml")].sort.each do |file|
      code = File.basename(file, ".yml")
      next if code == REFERENCE

      errors = compare(reference, YAML.safe_load_file(file), "", [])
      next puts("#{code}.yml: ok") if errors.empty?

      failed = true
      errors.each { |error| warn "#{code}.yml: #{error}" }
    end
    exit 1 if failed
  end
end

I18nCheck.run if $PROGRAM_NAME == __FILE__
