import '../../css/fullscreen.css';
import controlPanel from './controlPanel';

const plugin = function () {
  const genoverse = this;

  let supported   = true;
  let eventName   = 'fullscreenchange';  // All the browsers have different names
  let elemName    = 'fullscreenElement'; // ... even the capitalisation varies!
  let requestName = 'requestFullscreen';
  let cancelName  = 'exitFullscreen';

  if (document.onmsfullscreenchange || document.onmsfullscreenchange === null) {
    // We need the IE11 version of this to work; IE9-10 have the actions but not the events.
    // The key must be present, i.e. value may be null but it must not return undefined
    eventName   = 'MSFullscreenChange';
    elemName    = 'msFullscreenElement';
    cancelName  = 'msExitFullscreen';
    requestName = 'msRequestFullscreen';
  } else if (document.body.mozRequestFullScreen) {
    eventName   = 'mozfullscreenchange';
    elemName    = 'mozFullScreenElement';
    cancelName  = 'mozCancelFullScreen';
    requestName = 'mozRequestFullScreen';
  } else if (document.body.webkitRequestFullscreen) {
    eventName   = 'webkitfullscreenchange';
    elemName    = 'webkitFullscreenElement';
    cancelName  = 'webkitCancelFullScreen';
    requestName = 'webkitRequestFullscreen';
  } else if (!document.onfullscreenchange) {
    supported = false;
  }

  genoverse.fullscreenVars = {
    eventName   : eventName,
    elemName    : elemName,
    cancelName  : cancelName,
    requestName : requestName,

    enterEvent: (browser) => {
      console.log('browser.superContainer.width() = ', browser.superContainer.width());
      browser.superContainer.addClass('gv-fullscreen');
      // window.innerWidth inside an iframe reflects the iframe's viewport and does
      // not update when the element goes fullscreen. Use screen.width instead,
      // which gives the physical screen width in CSS pixels regardless of iframe sizing.
      console.log('screen.width = ', screen.width);
      browser.setWidth(screen.width);
      browser.controlPanel.find('.gv-fullscreen-button .fas').removeClass('fa-expand-arrows-alt').addClass('fa-compress-arrows-alt');
    },

    exitEvent: (browser) => {
      if (browser.superContainer.hasClass('gv-fullscreen')) {
        browser.superContainer.removeClass('gv-fullscreen');
        // Restore the width captured just before fullscreen was requested.
        // document.documentElement.clientWidth is unreliable here because
        // Genoverse's own setWidth calls alter the document layout.
        console.log('restoring preFullscreenWidth = ', browser._preFullscreenWidth);
        browser.setWidth(browser._preFullscreenWidth);
        browser.controlPanel.find('.gv-fullscreen-button .fas').removeClass('fa-compress-arrows-alt').addClass('fa-expand-arrows-alt');
      }
    },

    // Handles both enter and exit transitions.
    // Called after the browser has finished applying the fullscreen change,
    // so screen.width correctly reflects the full-screen viewport width.
    eventListener: () => {
      if (genoverse.superContainer.is(document[genoverse.fullscreenVars.elemName])) {
        genoverse.fullscreenVars.enterEvent(genoverse);
      } else {
        genoverse.fullscreenVars.exitEvent(genoverse);
        document.removeEventListener(genoverse.fullscreenVars.eventName, genoverse.fullscreenVars.eventListener);
      }
    },
  };

  if (supported) {
    genoverse.controls.push({
      icon   : '<i class="fas fa-expand-arrows-alt"></i>',
      class  : 'gv-fullscreen-button',
      name   : 'Toggle fullscreen view',
      action : (browser) => {
        if (browser.superContainer.hasClass('gv-fullscreen')) {
          document[browser.fullscreenVars.cancelName]();
        } else {
          // Capture the rendered width now — before requestFullscreen() is called
          // and before Genoverse's own setWidth calls alter the document layout.
          browser._preFullscreenWidth = browser.superContainer.width();
          console.log('captured _preFullscreenWidth = ', browser._preFullscreenWidth);
          // Register the listener before requesting fullscreen so the enter
          // transition is handled once the browser applies it.
          document.addEventListener(browser.fullscreenVars.eventName, browser.fullscreenVars.eventListener);
          browser.superContainer[0][browser.fullscreenVars.requestName]();
          // enterEvent is intentionally NOT called here — it must run after
          // the fullscreenchange event fires so that screen.width is available.
        }
      },
    });
  }
};

export default { fullscreen: plugin, requires: controlPanel };
