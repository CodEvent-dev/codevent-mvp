/**
 * Comportements JS minimaux du tableau de bord agent.
 * Charge en tant que fichier externe (et non en gestionnaire "onclick"
 * inline) pour rester compatible avec la politique de securite
 * Content-Security-Policy stricte (script-src 'self', aucun script
 * inline autorise).
 */
(function () {
  "use strict";

  var purgeForm = document.getElementById("purge-form");
  if (purgeForm) {
    purgeForm.addEventListener("submit", function (event) {
      var confirmed = window.confirm(
        "Confirmer l'anonymisation des signalements archives arrivee a expiration ?"
      );
      if (!confirmed) {
        event.preventDefault();
      }
    });
  }
})();
