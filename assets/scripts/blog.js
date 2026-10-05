(function () {
  var listEl = document.getElementById("blog-list");
  if (!listEl) return;

  var sitemapUrl = listEl.getAttribute("data-sitemap");
  var MAX_ITEMS = 20;
  var TITLE_OVERRIDES = {
    "rocking-gift-card": "Money for nothing, discounts for free: rocking the gift card loop",
    "sposoring-events": "Why we sponsor information security events",
    "commitiment-to-strengthening-community": "Strengthening the Brazilian cybersecurity community through education",
    "considerations-for-writing-security-reports": "Considerations for writing security reports",
    "vulnerability-price": "Economic taxonomy of vulnerabilities",
    "vuln-state-machine": "State machine for vulnerability management",
    "o-cibernauta-digital-safety-for-the-next-generation": "Digital safety for children: preparing the next generation",
    "primitives-and-vulnerabilities": "Primitives and vulnerabilities"
  };

  var BLOG_HOST = "blog.lesis.lat";

  function safeBlogUrl(value) {
    var url;
    try {
      url = new URL(value);
    } catch (e) {
      return null;
    }
    if (url.protocol !== "https:" || url.hostname !== BLOG_HOST) return null;
    return url.href;
  }

  function formatYearMonth(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
    var year = date.getUTCFullYear();
    var month = String(date.getUTCMonth() + 1).padStart(2, "0");
    return year + "." + month;
  }

  function extractPostDate(url, lastModified) {
    var match = url.match(/\/(\d{4})\/(\d{2})\/(\d{2})\//);
    if (match) {
      return new Date(match[1] + "-" + match[2] + "-" + match[3] + "T00:00:00Z");
    }
    var parsed = new Date(lastModified || "");
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function extractSlug(url) {
    var cleanUrl = url.split("#")[0].split("?")[0].replace(/\/+$/, "");
    var segment = cleanUrl.split("/").pop() || "";
    return segment.replace(/-(en|es)\.html$/i, "").replace(/\.html$/i, "");
  }

  function titleFromSlug(slug) {
    if (TITLE_OVERRIDES[slug]) return TITLE_OVERRIDES[slug];
    return slug
      .split("-")
      .map(function (word, index) {
        if (!word) return "";
        if (index > 0 && ["a", "an", "and", "for", "in", "of", "the", "to"].indexOf(word) !== -1) {
          return word;
        }
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(" ");
  }

  function isLegacyEnglishPostUrl(url) {
    return /\/\d{4}\/\d{2}\/\d{2}\/[^/]+-en\.html$/i.test(url);
  }

  function isModernBlogPostUrl(url) {
    return /\/blog\/[^/]+\/?$/i.test(url);
  }

  function fetchModernPostMetadata(item) {
    return fetch(item.link, { cache: "no-cache" })
      .then(function (response) {
        if (!response.ok) throw new Error("Post request failed: " + response.status);
        return response.text();
      })
      .then(function (htmlText) {
        htmlText = htmlText.replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
        var doc = new DOMParser().parseFromString(htmlText, "text/html");
        var docEl = doc.documentElement;
        var titleNode = doc.querySelector('meta[property="og:title"]') || doc.querySelector("title");
        var timeNode = doc.querySelector("time[datetime]");
        var lang = docEl ? (docEl.getAttribute("lang") || "").toLowerCase() : "";
        if (lang.indexOf("en") !== 0) return null;

        var title = titleNode ? titleNode.getAttribute("content") || titleNode.textContent : "";
        title = (title || "").replace(/\s+/g, " ").trim().slice(0, 200);

        return {
          link: item.link,
          title: title || item.title,
          date: extractPostDate(item.link, timeNode ? timeNode.getAttribute("datetime") : item.lastModified)
        };
      })
      .catch(function () {
        return null;
      });
  }

  function message(text) {
    var li = document.createElement("li");
    var h2 = document.createElement("h2");
    h2.className = "ibm-plex-sans-light";
    h2.textContent = text;
    li.appendChild(h2);
    listEl.replaceChildren(li);
  }

  function renderItems(items) {
    if (!items.length) {
      message("No English posts found.");
      return;
    }

    var fragment = document.createDocumentFragment();
    items.slice(0, MAX_ITEMS).forEach(function (item) {
      var li = document.createElement("li");
      var h2 = document.createElement("h2");
      h2.className = "ibm-plex-sans-light";

      var dateLabel = formatYearMonth(item.date);
      if (dateLabel) {
        var span = document.createElement("span");
        span.className = "blog-date";
        span.textContent = dateLabel;
        h2.appendChild(span);
      }

      var a = document.createElement("a");
      a.href = item.link;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = item.title;
      h2.appendChild(a);

      li.appendChild(h2);
      fragment.appendChild(li);
    });
    listEl.replaceChildren(fragment);
  }

  fetch(sitemapUrl, { cache: "no-cache" })
    .then(function (response) {
      if (!response.ok) throw new Error("Sitemap request failed: " + response.status);
      return response.text();
    })
    .then(function (xmlText) {
      var xml = new DOMParser().parseFromString(xmlText, "text/xml");
      var sitemapItems = Array.prototype.slice.call(xml.getElementsByTagName("url"))
        .map(function (node) {
          var locNode = node.getElementsByTagName("loc")[0];
          var lastmodNode = node.getElementsByTagName("lastmod")[0];
          var link = safeBlogUrl(locNode ? locNode.textContent.trim() : "");
          if (!link) return null;
          var lastModified = lastmodNode ? lastmodNode.textContent.trim() : "";
          return {
            link: link,
            title: titleFromSlug(extractSlug(link)),
            date: extractPostDate(link, lastModified),
            lastModified: lastModified
          };
        })
        .filter(Boolean);

      return Promise.all(
        sitemapItems.map(function (item) {
          if (isLegacyEnglishPostUrl(item.link)) return Promise.resolve(item);
          if (isModernBlogPostUrl(item.link)) return fetchModernPostMetadata(item);
          return Promise.resolve(null);
        })
      );
    })
    .then(function (items) {
      return items
        .filter(Boolean)
        .sort(function (a, b) {
          return (b.date ? b.date.getTime() : 0) - (a.date ? a.date.getTime() : 0);
        });
    })
    .then(renderItems)
    .catch(function () {
      message("Unable to load posts right now.");
    });
})();
