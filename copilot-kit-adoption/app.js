(function () {
  "use strict";

  var roiForm = document.getElementById("roi-form");

  function numericValue(id) {
    var field = document.getElementById(id);
    var value = field ? Number(field.value) : 0;
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  }

  function money(value) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
    }).format(value || 0);
  }

  function setText(id, value) {
    var target = document.getElementById(id);
    if (target) target.textContent = value;
  }

  function updateRoi() {
    var seats = numericValue("roi-seats");
    var activeRate = Math.min(100, numericValue("roi-active")) / 100;
    var monthlySeatCost = numericValue("roi-cost");
    var weeklyMinutes = numericValue("roi-minutes");
    var hourlyRate = numericValue("roi-rate");
    var weeksPerMonth = 52 / 12;

    var monthlyCost = seats * monthlySeatCost;
    var activeSeats = seats * activeRate;
    var monthlyCapacityValue = activeSeats * (weeklyMinutes / 60) * weeksPerMonth * hourlyRate;
    var ratio = monthlyCost > 0 ? monthlyCapacityValue / monthlyCost : 0;
    var breakEvenMinutes = activeSeats > 0 && hourlyRate > 0
      ? monthlyCost / activeSeats / hourlyRate / weeksPerMonth * 60
      : 0;

    setText("roi-monthly-cost", money(monthlyCost));
    setText("roi-capacity-value", money(monthlyCapacityValue));
    setText("roi-ratio", ratio.toFixed(1) + "x");
    setText("roi-break-even", breakEvenMinutes.toFixed(1) + " min");
  }

  if (roiForm) {
    roiForm.addEventListener("input", updateRoi);
    updateRoi();
  }

  function copyText(text, button) {
    function showCopied() {
      var original = button.textContent;
      button.textContent = "Copied";
      window.setTimeout(function () { button.textContent = original; }, 1500);
    }

    function fallbackCopy() {
      var textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try { document.execCommand("copy"); showCopied(); } catch (error) {}
      document.body.removeChild(textarea);
    }

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(showCopied).catch(fallbackCopy);
      return;
    }

    fallbackCopy();
  }

  document.addEventListener("click", function (event) {
    var button = event.target.closest(".prompt-card .copy-prompt");
    if (!button) return;
    var prompt = button.closest(".prompt-card").querySelector(".prompt-text");
    if (!prompt) return;
    event.preventDefault();
    event.stopPropagation();
    copyText(prompt.textContent.trim(), button);
  }, true);

  document.querySelectorAll("[data-copy-target]").forEach(function (button) {
    button.addEventListener("click", function () {
      var target = document.querySelector(button.getAttribute("data-copy-target"));
      if (target) copyText(target.textContent.trim(), button);
    });
  });
})();
