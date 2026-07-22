// No-op shim for fontfaceobserver on web.
// Fonts are already loaded via @font-face CSS injected by the Express server.
// This prevents the "6000ms timeout exceeded" unhandled rejection.
function FontFaceObserver(family, descriptors) {
  this.family = family;
}
FontFaceObserver.prototype.load = function(_text, _timeout) {
  return Promise.resolve(this);
};
module.exports = FontFaceObserver;
