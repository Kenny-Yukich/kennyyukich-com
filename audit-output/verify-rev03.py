import json
from pathlib import Path

from playwright.sync_api import sync_playwright


BASE = "http://127.0.0.1:4173"
OUT = Path(__file__).resolve().parent
ROUTES = {
    "case-study": "/copilot-kit-adoption/",
    "playbook": "/copilot-kit-adoption/90-day-playbook/",
    "prompt-gallery": "/copilot-kit-adoption/prompt-gallery/",
}
VIEWPORTS = {
    "desktop": {"width": 1440, "height": 900},
    "tablet": {"width": 768, "height": 900},
    "mobile": {"width": 390, "height": 844},
}


def structural_checks(page):
    return page.evaluate(
        """
        () => {
          const ids = [...document.querySelectorAll('[id]')].map((node) => node.id);
          const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
          const brokenFragments = [...document.querySelectorAll('a[href^="#"]')]
            .map((link) => link.getAttribute('href'))
            .filter((href) => href.length > 1 && !document.querySelector(href));
          const unlabeledControls = [...document.querySelectorAll('button, input, select')]
            .filter((node) => {
              const label = node.labels && node.labels.length;
              return !label && !node.getAttribute('aria-label') && !node.textContent.trim();
            }).map((node) => node.outerHTML.slice(0, 100));
          const overflowElements = [...document.querySelectorAll('body *')]
            .filter((node) => {
              const rect = node.getBoundingClientRect();
              const style = getComputedStyle(node);
              return rect.right > document.documentElement.clientWidth + 1 || rect.left < -1 ||
                (node.scrollWidth > node.clientWidth + 1 && style.overflowX === 'visible');
            })
            .slice(0, 15)
            .map((node) => ({
              tag: node.tagName,
              id: node.id,
              className: String(node.className || ''),
              left: Math.round(node.getBoundingClientRect().left),
              right: Math.round(node.getBoundingClientRect().right),
              scrollWidth: node.scrollWidth,
              clientWidth: node.clientWidth,
            }));
          return {
            title: document.title,
            overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            dimensions: {
              documentScrollWidth: document.documentElement.scrollWidth,
              documentClientWidth: document.documentElement.clientWidth,
              bodyScrollWidth: document.body.scrollWidth,
              bodyClientWidth: document.body.clientWidth,
            },
            duplicateIds,
            brokenFragments,
            unlabeledControls,
            overflowElements,
            headings: document.querySelectorAll('h1, h2').length,
          };
        }
        """
    )


results = {"routes": {}, "interactions": {}}

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    for viewport_name, viewport in VIEWPORTS.items():
        context = browser.new_context(viewport=viewport, color_scheme="light")
        for route_name, route in ROUTES.items():
            page = context.new_page()
            errors = []
            failed = []
            page.on("pageerror", lambda error, errors=errors: errors.append(str(error)))
            page.on(
                "console",
                lambda message, errors=errors: errors.append(message.text)
                if message.type == "error"
                else None,
            )
            page.on(
                "requestfailed",
                lambda request, failed=failed: failed.append(
                    {"url": request.url, "error": request.failure}
                ),
            )
            response = page.goto(BASE + route, wait_until="networkidle")
            key = f"{route_name}:{viewport_name}"
            results["routes"][key] = {
                "status": response.status if response else None,
                **structural_checks(page),
                "errors": errors,
                "failedRequests": failed,
            }
            if viewport_name == "desktop":
                page.screenshot(path=OUT / f"rev03-{route_name}.png", full_page=True)
            if route_name == "case-study" and viewport_name == "mobile":
                page.screenshot(path=OUT / "rev03-case-study-mobile.png", full_page=True)
            page.close()
        context.close()

    context = browser.new_context(viewport=VIEWPORTS["desktop"])

    page = context.new_page()
    page.goto(BASE + ROUTES["playbook"], wait_until="networkidle")
    initial_visible = page.locator("[data-panel]:visible").count()
    page.locator("#phase-tab-1").click()
    clicked_panel = page.locator("#phase-panel-1").is_visible()
    page.locator("#phase-tab-1").press("ArrowRight")
    keyboard_panel = page.locator("#phase-panel-2").is_visible()
    roi_text = page.locator("#roi-ratio").inner_text()
    results["interactions"]["playbook"] = {
        "initialVisiblePanels": initial_visible,
        "clickActivatesPanel": clicked_panel,
        "arrowKeyActivatesNextPanel": keyboard_panel,
        "roiCalculated": roi_text,
    }
    page.close()

    page = context.new_page()
    page.goto(BASE + ROUTES["prompt-gallery"], wait_until="networkidle")
    page.wait_for_function("document.querySelectorAll('#prompt-grid .prompt-card').length > 0")
    initial_cards = page.locator("#prompt-grid .prompt-card").count()
    initial_status = page.locator("#prompt-status").inner_text()
    page.locator("#prompt-search").fill("safety")
    safety_cards = page.locator("#prompt-grid .prompt-card").count()
    safety_status = page.locator("#prompt-status").inner_text()
    page.locator("#prompt-reset").click()
    page.wait_for_timeout(50)
    reset_cards = page.locator("#prompt-grid .prompt-card").count()
    results["interactions"]["promptGallery"] = {
        "initialCards": initial_cards,
        "initialStatus": initial_status,
        "safetyCards": safety_cards,
        "safetyStatus": safety_status,
        "resetCards": reset_cards,
    }
    page.close()

    page = context.new_page()
    page.goto(BASE + ROUTES["case-study"], wait_until="networkidle")
    results["interactions"]["caseStudy"] = page.evaluate(
        """
        () => ({
          playbookLink: !!document.querySelector('a[href="/copilot-kit-adoption/90-day-playbook/"]'),
          galleryLink: !!document.querySelector('a[href="/copilot-kit-adoption/prompt-gallery/"]'),
          resumeLink: !!document.querySelector('a[download][href*="Kenny_Yukich_Resume"]'),
          contactLink: !!document.querySelector('a[href^="mailto:"]'),
          navItems: document.querySelectorAll('#resource-nav a').length,
        })
        """
    )
    page.close()
    context.close()
    browser.close()

print(json.dumps(results, indent=2))
