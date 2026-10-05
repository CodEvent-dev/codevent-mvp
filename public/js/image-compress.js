/**
 * Compression client-side d'une image avant upload (Green IT).
 * Redimensionne l'image dans un <canvas> et la re-encode en JPEG a
 * qualite reduite, afin de limiter la bande passante consommee par
 * l'appareil du citoyen et le stockage cote serveur.
 *
 * Vanilla JS pur, aucune dependance externe (conforme au cahier des
 * charges "minimum absolu de JavaScript lourd").
 */
(function (window) {
  "use strict";

  var MAX_DIMENSION = 1280;
  var JPEG_QUALITY = 0.7;

  /**
   * @param {File} file Fichier image d'origine choisi par l'utilisateur
   * @returns {Promise<Blob>} Blob JPEG compresse
   */
  function compressImage(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var reader = new FileReader();

      reader.onerror = function () {
        reject(new Error("Lecture du fichier impossible."));
      };

      reader.onload = function () {
        img.onload = function () {
          var width = img.width;
          var height = img.height;

          if (width > height && width > MAX_DIMENSION) {
            height = Math.round((height * MAX_DIMENSION) / width);
            width = MAX_DIMENSION;
          } else if (height > MAX_DIMENSION) {
            width = Math.round((width * MAX_DIMENSION) / height);
            height = MAX_DIMENSION;
          }

          var canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;

          var ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            function (blob) {
              if (!blob) {
                reject(new Error("Compression de l'image impossible."));
                return;
              }
              resolve(blob);
            },
            "image/jpeg",
            JPEG_QUALITY
          );
        };
        img.onerror = function () {
          reject(new Error("Image illisible ou format non supporte."));
        };
        img.src = reader.result;
      };

      reader.readAsDataURL(file);
    });
  }

  window.MairieConnect = window.MairieConnect || {};
  window.MairieConnect.compressImage = compressImage;
})(window);
