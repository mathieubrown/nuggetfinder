window.NuggetfinderShare = (function () {
  'use strict';

  var ink = '#161514';
  var backgrounds = {
    yes: '#0E5A46', nope: '#C8321F', mixed: '#F4B223',
    pending: '#F4B223', stale: '#F5F0E6', none: '#F5F0E6'
  };

  function fitText(context, text, x, y, maxWidth, fontSize) {
    do {
      context.font = '900 ' + fontSize + 'px "Archivo Black", "Arial Black", sans-serif';
      fontSize -= 2;
    } while (fontSize > 20 && context.measureText(text).width > maxWidth);
    context.fillText(text, x, y, maxWidth);
  }

  function wrapText(context, text, x, y, maxWidth) {
    for (var size = 66; size >= 34; size -= 4) {
      context.font = '900 ' + size + 'px "Archivo Black", "Arial Black", sans-serif';
      var lines = [''];
      Array.from(text).forEach(function (character) {
        var last = lines.length - 1;
        var line = lines[last] + character;
        if (context.measureText(line).width > maxWidth) {
          var split = line.lastIndexOf(' ');
          if (split > 0) {
            lines[last] = line.slice(0, split);
            lines.push(line.slice(split + 1));
          } else lines.push(character);
        } else lines[last] = line;
      });
      if (lines.length * (size + 8) <= 320) {
        lines.forEach(function (line, index) { context.fillText(line, x, y + index * (size + 8)); });
        return;
      }
    }
    fitText(context, text, x, y, maxWidth, 52);
  }

  async function makeCard(details) {
    if (document.fonts) {
      await document.fonts.load('900 48px "Archivo Black"', details.product + details.place + details.label);
      await document.fonts.ready;
    }
    var canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1920;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#F5F0E6';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(80, 100);
    ctx.scale(3.1, 3.1);
    var nugget = new Path2D('M8 24 C5 12 17 5 29 7 C42 9 49 19 44 30 C40 40 26 44 16 40 C9 37 9 30 8 24 Z');
    ctx.fillStyle = '#F4B223';
    ctx.strokeStyle = ink;
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.fill(nugget);
    ctx.stroke(nugget);
    ctx.fillStyle = ink;
    [[21, 19, 2.4], [32, 27, 2.4], [19, 30, 2]].forEach(function (dot) {
      ctx.beginPath();
      ctx.arc(dot[0], dot[1], dot[2], 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();

    ctx.fillStyle = ink;
    fitText(ctx, 'NUGGETFINDER', 250, 186, 750, 65);
    ctx.fillRect(92, 412, 920, 490);
    ctx.fillStyle = '#FFFDF8';
    ctx.fillRect(80, 400, 920, 490);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 8;
    ctx.strokeRect(80, 400, 920, 490);
    ctx.fillStyle = ink;
    fitText(ctx, details.brand.toUpperCase(), 130, 530, 820, 42);
    wrapText(ctx, details.product, 130, 620, 820);
    fitText(ctx, details.place, 80, 975, 920, 48);
    fitText(ctx, details.area, 80, 1035, 920, 38);

    ctx.save();
    ctx.translate(540, 1170);
    ctx.rotate(-0.07);
    ctx.fillRect(-385, -92, 790, 205);
    ctx.fillStyle = backgrounds[details.status];
    ctx.fillRect(-395, -102, 790, 205);
    ctx.strokeRect(-395, -102, 790, 205);
    ctx.fillStyle = details.status === 'yes' || details.status === 'nope' ? '#FFFFFF' : ink;
    ctx.textAlign = 'center';
    fitText(ctx, details.label, 0, 27, 720, 73);
    ctx.restore();

    ctx.fillStyle = ink;
    if (details.lastSeen) fitText(ctx, details.lastSeen, 80, 1450, 920, 38);
    ctx.fillStyle = '#F4B223';
    ctx.fillRect(0, 1570, 1080, 350);
    ctx.fillStyle = ink;
    ctx.fillRect(0, 1570, 1080, 8);
    fitText(ctx, details.username || 'NUGGETFINDER COMMUNITY', 80, 1710, 920, 56);
    fitText(ctx, 'mathieubrown.github.io/nuggetfinder', 80, 1810, 920, 44);

    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (blob) resolve(blob);
        else reject(new Error('Image unavailable'));
      }, 'image/png');
    });
  }

  async function download(details) {
    var blob = await makeCard(details);
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'nuggetfinder-' + details.productId + '.png';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
  }

  return { download: download };
})();
