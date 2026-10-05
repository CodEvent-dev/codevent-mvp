/**
 * Logique du formulaire de signalement en 3 etapes.
 * Vanilla JS, sans framework, pour un chargement et une execution
 * quasi instantanes sur mobile (cf. exigence "s'instancier
 * instantanement" du cahier des charges).
 */
(function () {
  "use strict";

  var form = document.getElementById("signalement-form");
  if (!form) return;

  var panels = form.querySelectorAll("[data-step-panel]");
  var stepDots = document.querySelectorAll("[data-step]");
  var errorBox = document.getElementById("form-error");
  var stepLive = document.getElementById("step-live");
  var currentStep = 1;
  var stepNames = { 1: "Categorie", 2: "Lieu", 3: "Details" };

  function firstFocusable(panel) {
    return panel.querySelector(
      'input:not([type="hidden"]):not(.sr-only), textarea, button, select'
    );
  }

  function showStep(step, options) {
    var announce = !options || options.announce !== false;
    panels.forEach(function (panel) {
      var isTarget = Number(panel.getAttribute("data-step-panel")) === step;
      panel.hidden = !isTarget;
      panel.classList.toggle("hidden", !isTarget);
      if (isTarget) {
        panel.removeAttribute("inert");
      } else if ("inert" in panel) {
        panel.inert = true;
      }
    });
    stepDots.forEach(function (dot) {
      var n = Number(dot.getAttribute("data-step"));
      dot.classList.remove("is-active", "is-done", "is-idle");
      dot.removeAttribute("aria-current");
      if (n === step) {
        dot.classList.add("is-active");
        dot.setAttribute("aria-current", "step");
      } else if (n < step) {
        dot.classList.add("is-done");
      } else {
        dot.classList.add("is-idle");
      }
    });
    currentStep = step;
    hideError();
    if (announce && stepLive) {
      stepLive.textContent = "Etape " + step + " sur 3 : " + stepNames[step] + ".";
    }
    var panel = form.querySelector('[data-step-panel="' + step + '"]');
    if (panel && (!options || options.focus !== false)) {
      var target = firstFocusable(panel);
      if (target) target.focus();
    }
  }

  function showError(message, field) {
    errorBox.textContent = message;
    errorBox.classList.remove("hidden");
    if (field) {
      field.setAttribute("aria-invalid", "true");
      field.setAttribute("aria-describedby", (field.getAttribute("aria-describedby") || "") + " form-error");
    }
    errorBox.focus();
  }

  function hideError() {
    errorBox.classList.add("hidden");
    errorBox.textContent = "";
    form.querySelectorAll("[aria-invalid]").forEach(function (el) {
      el.removeAttribute("aria-invalid");
    });
  }

  function isAutreSelected() {
    var category = form.querySelector('input[name="category"]:checked');
    return category && category.value === "autre";
  }

  function toggleOtherPrecision() {
    var block = document.getElementById("other-precision-block");
    var input = document.getElementById("other-precision");
    if (!block || !input) return;
    if (isAutreSelected()) {
      block.classList.remove("hidden");
      block.hidden = false;
      input.setAttribute("required", "required");
      input.setAttribute("aria-required", "true");
      input.focus();
    } else {
      block.classList.add("hidden");
      block.hidden = true;
      input.removeAttribute("required");
      input.removeAttribute("aria-required");
      input.value = "";
    }
  }

  function validateStep(step) {
    if (step === 1) {
      var category = form.querySelector('input[name="category"]:checked');
      if (!category) {
        showError("Merci de choisir une categorie.");
        return false;
      }
      if (category.value === "autre") {
        var precision = document.getElementById("other-precision");
        if (!precision || precision.value.trim().length < 3) {
          showError("Pour la categorie Autre, merci de preciser le probleme (3 caracteres minimum).", precision);
          return false;
        }
      }
    }
    if (step === 2) {
      var address = form.querySelector("#address");
      if (!address.value || address.value.trim().length < 3) {
        showError("Merci de renseigner une adresse ou un lieu.", address);
        return false;
      }
    }
    return true;
  }

  form.addEventListener("click", function (event) {
    var target = event.target.closest("[data-action]");
    if (!target) return;

    var action = target.getAttribute("data-action");
    if (action === "next" && validateStep(currentStep)) {
      showStep(currentStep + 1);
    } else if (action === "prev") {
      showStep(currentStep - 1);
    }
  });

  form.addEventListener("keydown", function (event) {
    if (event.key !== "Enter") return;
    if (event.target && event.target.tagName === "TEXTAREA") return;
    if (event.target && event.target.getAttribute("type") === "submit") return;
    if (currentStep < 3) {
      event.preventDefault();
      if (validateStep(currentStep)) showStep(currentStep + 1);
    }
  });

  form.querySelectorAll(".category-option").forEach(function (label) {
    var input = label.querySelector("input");
    input.addEventListener("change", function () {
      form.querySelectorAll(".category-option").forEach(function (l) {
        l.classList.remove("is-selected");
      });
      label.classList.add("is-selected");
      toggleOtherPrecision();
    });
  });

  var MAX_ACCURACY_M = 30;
  var COARSE_ACCURACY_M = 250;
  var geolocButton = document.getElementById("geoloc-button");
  var geolocStatus = document.getElementById("geoloc-status");
  var geolocWatchId = null;
  var geolocTimer = null;

  function stopGeolocWatch() {
    if (geolocWatchId !== null) {
      navigator.geolocation.clearWatch(geolocWatchId);
      geolocWatchId = null;
    }
    if (geolocTimer !== null) {
      window.clearTimeout(geolocTimer);
      geolocTimer = null;
    }
  }

  function clearGpsFields() {
    document.getElementById("latitude").value = "";
    document.getElementById("longitude").value = "";
    document.getElementById("gps-accuracy").value = "";
  }

  function formatMeters(meters) {
    if (meters >= 1000) {
      return (Math.round(meters / 100) / 10).toString().replace(".", ",") + " km";
    }
    return Math.round(meters) + " m";
  }

  function fetchAddressHint(lat, lon, accuracy, hintOnly) {
    var params = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      accuracy: String(accuracy),
    });
    if (hintOnly) params.set("hint", "1");

    return fetch("/api/geocode?" + params.toString(), { credentials: "same-origin" }).then(
      function (response) {
        return response.json().then(function (data) {
          if (!response.ok) {
            throw new Error(data.error || "Adresse introuvable.");
          }
          return data;
        });
      }
    );
  }

  function finishGeoloc() {
    geolocButton.disabled = false;
    geolocButton.removeAttribute("aria-busy");
  }

  function acceptPrecisePosition(position) {
    var lat = position.coords.latitude;
    var lon = position.coords.longitude;
    var accuracy = position.coords.accuracy;
    document.getElementById("latitude").value = lat;
    document.getElementById("longitude").value = lon;
    document.getElementById("gps-accuracy").value = String(Math.round(accuracy));
    geolocStatus.textContent = "Position a " + formatMeters(accuracy) + ". Recherche de la voie...";

    fetchAddressHint(lat, lon, accuracy, false)
      .then(function (data) {
        document.getElementById("address").value = data.address;
        geolocStatus.textContent =
          "Position GPS retenue (" + formatMeters(accuracy) + "). Vous pouvez corriger l'adresse.";
      })
      .catch(function (error) {
        geolocStatus.textContent =
          (error.message || "Adresse introuvable.") +
          " Les coordonnees GPS (precision " +
          formatMeters(accuracy) +
          ") sont conservees.";
      })
      .finally(finishGeoloc);
  }

  function giveUpWithCoarseHint(best) {
    clearGpsFields();
    if (!best) {
      geolocStatus.textContent =
        "Aucun GPS satellite n'a repondu. Sur un ordinateur de bureau, le navigateur n'a souvent qu'une zone de plusieurs kilometres (box internet). Saisissez l'adresse a la main.";
      finishGeoloc();
      return;
    }

    var accuracy = best.coords.accuracy;
    geolocStatus.textContent =
      "Pas de GPS precis. Le navigateur situe seulement une zone d'environ " +
      formatMeters(accuracy) +
      " (Wi-Fi ou box, pas un satellite). Recherche de la commune...";

    fetchAddressHint(best.coords.latitude, best.coords.longitude, accuracy, true)
      .then(function (data) {
        var field = document.getElementById("address");
        if (!field.value.trim()) field.value = data.address;
        geolocStatus.textContent =
          "Zone approximative : " +
          data.address +
          ". Precisez la rue ou le lieu-dit : un PC de bureau n'atteint presque jamais 30 m.";
      })
      .catch(function () {
        geolocStatus.textContent =
          "Le navigateur n'a qu'une zone d'environ " +
          formatMeters(accuracy) +
          ". Ce n'est pas un GPS. Saisissez l'adresse a la main.";
      })
      .finally(finishGeoloc);
  }

  if (geolocButton) {
    geolocButton.addEventListener("click", function () {
      if (!navigator.geolocation) {
        geolocStatus.textContent = "La geolocalisation n'est pas disponible sur cet appareil.";
        return;
      }

      stopGeolocWatch();
      clearGpsFields();
      geolocButton.disabled = true;
      geolocButton.setAttribute("aria-busy", "true");
      geolocStatus.textContent =
        "Recherche d'une position GPS (30 m ou moins). Un telephone a l'exterieur fonctionne mieux qu'un ordinateur.";

      var accepted = false;
      var best = null;
      var lastAccuracy = null;
      var staleRounds = 0;

      geolocWatchId = navigator.geolocation.watchPosition(
        function (position) {
          if (accepted) return;
          var accuracy = position.coords.accuracy;
          if (isFinite(accuracy) && (!best || accuracy < best.coords.accuracy)) {
            best = position;
          }

          if (isFinite(accuracy) && accuracy <= MAX_ACCURACY_M) {
            accepted = true;
            stopGeolocWatch();
            acceptPrecisePosition(position);
            return;
          }

          if (lastAccuracy !== null && isFinite(accuracy) && Math.abs(accuracy - lastAccuracy) < 50) {
            staleRounds += 1;
          } else {
            staleRounds = 0;
          }
          lastAccuracy = accuracy;

          if (isFinite(accuracy) && accuracy > COARSE_ACCURACY_M) {
            geolocStatus.textContent =
              "Position reseau d'environ " +
              formatMeters(accuracy) +
              " : c'est la box / le Wi-Fi, pas un GPS. On attend encore quelques secondes au cas ou le satellite reponde.";
          } else if (isFinite(accuracy)) {
            geolocStatus.textContent =
              "Precision actuelle : " +
              formatMeters(accuracy) +
              ". Il faut 30 m ou moins. Restez a l'exterieur si possible.";
          }

          if (staleRounds >= 2 && best && best.coords.accuracy > MAX_ACCURACY_M) {
            accepted = true;
            stopGeolocWatch();
            giveUpWithCoarseHint(best);
          }
        },
        function (error) {
          if (accepted) return;
          if (error && error.code === 3) return;
          accepted = true;
          stopGeolocWatch();
          clearGpsFields();
          finishGeoloc();
          geolocStatus.textContent =
            error && error.code === 1
              ? "Autorisez la localisation dans le navigateur, puis reessayez. Sur Windows, activez aussi la localisation dans les parametres."
              : "Impossible de recuperer votre position. Saisissez l'adresse a la main.";
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 }
      );

      geolocTimer = window.setTimeout(function () {
        if (accepted) return;
        accepted = true;
        stopGeolocWatch();
        giveUpWithCoarseHint(best);
      }, 10000);
    });
  }

  var photoInput = document.getElementById("photo");
  var photoPreview = document.getElementById("photo-preview");
  var compressedBlob = null;

  if (photoInput) {
    photoInput.addEventListener("change", function () {
      var file = photoInput.files[0];
      if (!file) {
        compressedBlob = null;
        photoPreview.classList.add("hidden");
        photoPreview.removeAttribute("src");
        return;
      }

      window.MairieConnect.compressImage(file)
        .then(function (blob) {
          compressedBlob = blob;
          var url = URL.createObjectURL(blob);
          photoPreview.src = url;
          photoPreview.classList.remove("hidden");
        })
        .catch(function () {
          showError("Cette image n'a pas pu etre traitee. Merci d'essayer avec une autre photo.");
          photoInput.value = "";
        });
    });
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (!validateStep(1)) {
      showStep(1);
      return;
    }
    if (!validateStep(2)) {
      showStep(2);
      return;
    }

    var submitButton = document.getElementById("submit-button");
    submitButton.disabled = true;
    submitButton.setAttribute("aria-busy", "true");
    submitButton.textContent = "Envoi en cours...";

    var formData = new FormData();
    formData.append("category", form.querySelector('input[name="category"]:checked').value);
    formData.append("address", document.getElementById("address").value);
    formData.append("description", document.getElementById("description").value);
    formData.append("latitude", document.getElementById("latitude").value);
    formData.append("longitude", document.getElementById("longitude").value);
    formData.append("gps_accuracy", document.getElementById("gps-accuracy").value);
    var otherPrecision = document.getElementById("other-precision");
    if (otherPrecision && otherPrecision.value) {
      formData.append("other_precision", otherPrecision.value);
    }
    if (compressedBlob) {
      formData.append("photo", compressedBlob, "signalement.jpg");
    }

    var csrfToken = form.querySelector('input[name="_csrf"]').value;

    fetch("/api/signalements", {
      method: "POST",
      body: formData,
      headers: { "X-CSRF-Token": csrfToken },
      credentials: "same-origin",
    })
      .then(function (response) {
        return response.json().then(function (data) {
          if (!response.ok) {
            throw new Error(data.error || "Une erreur est survenue.");
          }
          return data;
        });
      })
      .then(function (data) {
        window.location.href = "/confirmation?code=" + encodeURIComponent(data.referenceCode);
      })
      .catch(function (error) {
        showError(error.message || "Une erreur est survenue lors de l'envoi.");
        submitButton.disabled = false;
        submitButton.removeAttribute("aria-busy");
        submitButton.textContent = "Envoyer le signalement";
      });
  });

  showStep(1, { announce: false, focus: false });
})();
