"""Playwright smoke test for Spider-Math: plays real rounds, captures screenshots.

Requires: pip install playwright && playwright install chromium
Run:      python3 -m http.server 8642   (from the project root, in another terminal)
          python tools/smoke_test.py
"""
import os
import sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8642/index.html"
SHOTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "screenshots")
os.makedirs(SHOTS, exist_ok=True)

errors = []


def state(page):
    return page.evaluate(
        "() => ({ phase: window.__spidermath.game.phase, qi: window.__spidermath.game.qi,"
        " lives: window.__spidermath.game.lives, correct: window.__spidermath.game.correct,"
        " screen: window.__spidermath.game.screen, correctIndex: window.__spidermath.game.correctIndex })"
    )


def building_click_point(page, index):
    return page.evaluate(
        """(i) => {
            const l = window.__spidermath.getLayout();
            const b = l.buildings[i];
            return { x: b.cx, y: (b.y + l.groundY) / 2 };
        }""",
        index,
    )


def wait_idle(page, timeout_ms=8000):
    page.wait_for_function(
        "() => window.__spidermath.game.phase === 'idle' && window.__spidermath.game.screen === 'play'",
        timeout=timeout_ms,
    )


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        page.on(
            "console",
            lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None,
        )

        page.goto(BASE)
        page.wait_for_timeout(1500)
        page.screenshot(path=f"{SHOTS}/01_start.png")

        # --- Start grade 1 ---
        page.click('.grade-btn[data-grade="1"]')
        page.wait_for_timeout(600)
        page.screenshot(path=f"{SHOTS}/02_play_idle.png")
        s = state(page)
        assert s["screen"] == "play" and s["phase"] == "idle", f"bad state after start: {s}"
        q_text = page.text_content("#question-text")
        print(f"Q1: {q_text}  correctIndex={s['correctIndex']}")

        # --- Answer Q1 correctly, capture mid-swing ---
        pt = building_click_point(page, s["correctIndex"])
        page.mouse.click(pt["x"], pt["y"])
        page.wait_for_timeout(650)
        page.screenshot(path=f"{SHOTS}/03_swing.png")
        page.wait_for_timeout(900)
        page.screenshot(path=f"{SHOTS}/04_celebrate.png")
        wait_idle(page)
        s = state(page)
        assert s["qi"] == 1 and s["correct"] == 1 and s["lives"] == 3, f"after correct: {s}"
        print(f"After correct answer: {s}")

        # --- Answer Q2 wrongly, capture collapse + reveal ---
        wrong = (s["correctIndex"] + 1) % 3
        pt = building_click_point(page, wrong)
        page.mouse.click(pt["x"], pt["y"])
        page.wait_for_timeout(1700)
        page.screenshot(path=f"{SHOTS}/05_collapse.png")
        page.wait_for_timeout(900)
        page.screenshot(path=f"{SHOTS}/06_reveal.png")
        wait_idle(page)
        s = state(page)
        assert s["qi"] == 2 and s["correct"] == 1 and s["lives"] == 2, f"after wrong: {s}"
        print(f"After wrong answer: {s}")

        # --- Finish the round with correct answers -> win screen ---
        for _ in range(8):
            s = state(page)
            pt = building_click_point(page, s["correctIndex"])
            page.mouse.click(pt["x"], pt["y"])
            page.wait_for_function(
                "() => window.__spidermath.game.screen !== 'play' || "
                f"window.__spidermath.game.qi > {s['qi']}",
                timeout=8000,
            )
            if state(page)["screen"] == "end":
                break
            wait_idle(page)
        page.wait_for_timeout(700)
        s = state(page)
        assert s["screen"] == "end", f"expected end screen: {s}"
        end_title = page.text_content("#end-title")
        end_score = page.text_content("#end-score")
        print(f"End screen: {end_title} | {end_score}")
        page.screenshot(path=f"{SHOTS}/07_win.png")

        # --- Play again button ---
        page.click("#btn-again")
        page.wait_for_timeout(400)
        assert state(page)["screen"] == "play", "play again failed"
        page.click("#btn-home")
        page.wait_for_timeout(300)
        assert page.is_visible("#start-screen"), "home button failed"

        # --- Lose path: pick wrong 3x -> game over ---
        page.click('.grade-btn[data-grade="3"]')
        page.wait_for_timeout(500)
        for _ in range(3):
            wait_idle(page)
            s = state(page)
            wrong = (s["correctIndex"] + 1) % 3
            pt = building_click_point(page, wrong)
            page.mouse.click(pt["x"], pt["y"])
            page.wait_for_function(
                "() => window.__spidermath.game.screen === 'end' || "
                "(window.__spidermath.game.phase === 'idle' && window.__spidermath.game.flipT >= 1)",
                timeout=9000,
            )
        page.wait_for_timeout(600)
        s = state(page)
        assert s["screen"] == "end" and s["lives"] == 0, f"expected game over: {s}"
        print(f"Game over reached: {page.text_content('#end-title')}")
        page.screenshot(path=f"{SHOTS}/08_gameover.png")
        browser.close()

        # --- Mobile viewport (portrait phone) ---
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        page.on("pageerror", lambda e: errors.append(f"mobile pageerror: {e}"))
        page.goto(BASE)
        page.wait_for_timeout(1200)
        page.screenshot(path=f"{SHOTS}/09_mobile_start.png")
        page.tap('.grade-btn[data-grade="2"]')
        page.wait_for_timeout(600)
        page.screenshot(path=f"{SHOTS}/10_mobile_play.png")
        s = state(page)
        assert s["screen"] == "play", f"mobile start failed: {s}"
        pt = building_click_point(page, s["correctIndex"])
        page.touchscreen.tap(pt["x"], pt["y"])
        page.wait_for_timeout(800)
        page.screenshot(path=f"{SHOTS}/11_mobile_swing.png")
        wait_idle(page)
        assert state(page)["correct"] == 1, "mobile tap answer failed"
        print("Mobile flow OK")

        # --- Landscape phone ---
        page.set_viewport_size({"width": 844, "height": 390})
        page.wait_for_timeout(500)
        page.screenshot(path=f"{SHOTS}/12_mobile_landscape.png")
        browser.close()

    if errors:
        print("\nJS ERRORS CAPTURED:")
        for e in errors:
            print("  " + e)
        sys.exit(1)
    print("\nALL SMOKE TESTS PASSED — no JS errors")


if __name__ == "__main__":
    main()
