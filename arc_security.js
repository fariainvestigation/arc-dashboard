(function(global){
  "use strict";
  var ARC = global.ARC = global.ARC || {};
  function purifier(){ return global.DOMPurify && typeof global.DOMPurify.sanitize === "function" ? global.DOMPurify : null; }
  ARC.safeHtml = function(value, options){
    var p = purifier();
    if (!p) {
      // Fail closed for untrusted rich HTML: render as plain text rather than trusting markup.
      var div = document.createElement("div");
      div.textContent = String(value == null ? "" : value);
      return div.innerHTML;
    }
    var opts = Object.assign({
      USE_PROFILES: { html: true },
      FORBID_TAGS: ["script","iframe","object","embed","form","meta","base"],
      FORBID_ATTR: ["srcdoc"]
    }, options || {});
    return p.sanitize(String(value == null ? "" : value), opts);
  };
  ARC.safeSvg = function(value){
    var p = purifier();
    if (!p) return "";
    return p.sanitize(String(value == null ? "" : value), {
      USE_PROFILES: { svg: true, svgFilters: false, html: false },
      FORBID_TAGS: ["script","foreignObject","iframe","object","embed"],
      FORBID_ATTR: ["onload","onclick","onerror","href","xlink:href"]
    });
  };
  ARC.setSafeHtml = function(node, value, options){
    if (!node) return;
    node.innerHTML = ARC.safeHtml(value, options);
  };
})(window);
