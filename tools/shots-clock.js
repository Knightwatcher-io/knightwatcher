// Stops the page's clock at 13:46 on 25 November 2026, local time, for the website's pictures
// (tools/shots.sh site). The address's t= freezes the scene but not the clock, which reads the
// time of day, so without this the pictures would change with the minute they were taken in.
// shots.sh puts it before the page's own scripts in a copy of web/ outside the repository; it is
// never part of the page. A Date made with no arguments, and Date.now(), give that moment; a Date
// made from a value is a plain Date.
(function () {
  'use strict';
  const Plain = Date, AT = new Plain(2026, 10, 25, 13, 46, 0, 0).getTime();
  class Stopped extends Plain {
    constructor(...args) { if (args.length) super(...args); else super(AT); }
    static now() { return AT; }
  }
  window.Date = Stopped;
})();
