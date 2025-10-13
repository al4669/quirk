// Configure marked for GFM
marked.setOptions({
  gfm: true,
  breaks: true,
  tables: true,
  highlight: function (code, lang) {
    if (Prism.languages[lang]) {
      return Prism.highlight(code, Prism.languages[lang], lang);
    }
    return code;
  },
});
