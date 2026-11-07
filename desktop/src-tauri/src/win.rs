//! Win32 details that make the overlay behave like a HUD: never steals focus, no Alt+Tab entry,
//! and shows without activating.

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};
use windows::Win32::Foundation::{HWND, POINT, RECT};
use windows::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, MapVirtualKeyW, SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS,
    KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP, MAPVK_VK_TO_VSC, VK_LBUTTON, VK_LMENU, VK_MENU, VK_RBUTTON,
};
use windows::Win32::UI::WindowsAndMessaging::{
    BringWindowToTop, GetCursorPos, GetForegroundWindow, GetSystemMetrics, GetWindowLongPtrW, GetWindowRect,
    GetWindowThreadProcessId, IsWindowVisible, SetForegroundWindow, SetWindowLongPtrW, SetWindowPos, ShowWindow,
    GWL_EXSTYLE, SM_SWAPBUTTON, SWP_NOACTIVATE, SWP_NOSIZE, SWP_NOZORDER, SW_HIDE, SW_SHOWNOACTIVATE,
    WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
};

pub const OVERLAY: &str = "overlay";
pub const CODE: &str = "code";

/// Developer escape hatch (screenshots, demos): GLINT_ALLOW_CAPTURE=1 keeps the overlay capturable.
pub fn set_protected(w: &WebviewWindow, on: bool) {
    let allow_capture = std::env::var("GLINT_ALLOW_CAPTURE").is_ok_and(|v| v == "1");
    let _ = w.set_content_protected(on && !allow_capture);
}

pub fn overlay(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(OVERLAY)
}

pub fn code_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(CODE)
}

pub fn hwnd(w: &WebviewWindow) -> Option<HWND> {
    w.hwnd().ok()
}

/// Tool window (no Alt+Tab) + optionally no-activate (clicks don't steal focus).
pub fn set_noactivate(w: &WebviewWindow, on: bool) {
    let Some(h) = hwnd(w) else { return };
    unsafe {
        let mut ex = GetWindowLongPtrW(h, GWL_EXSTYLE) | WS_EX_TOOLWINDOW.0 as isize;
        if on {
            ex |= WS_EX_NOACTIVATE.0 as isize;
        } else {
            ex &= !(WS_EX_NOACTIVATE.0 as isize);
        }
        SetWindowLongPtrW(h, GWL_EXSTYLE, ex);
    }
}

/// Give the overlay keyboard focus. Windows only lets the foreground process change focus, and
/// tao's set_focus skips windows it didn't show itself, so this does it directly:
/// plain SetForegroundWindow → borrow the foreground thread's input state → Alt-tap fallback.
pub fn focus(w: &WebviewWindow) {
    let Some(h) = hwnd(w) else { return };
    unsafe {
        let fg = GetForegroundWindow();
        if fg == h || SetForegroundWindow(h).as_bool() {
            return;
        }
        let fg_thread = GetWindowThreadProcessId(fg, None);
        let me = GetCurrentThreadId();
        let attached = fg_thread != 0 && fg_thread != me && AttachThreadInput(me, fg_thread, true).as_bool();
        let _ = BringWindowToTop(h);
        let ok = SetForegroundWindow(h).as_bool();
        if attached {
            let _ = AttachThreadInput(me, fg_thread, false);
        }
        if ok && GetForegroundWindow() == h {
            return;
        }
        let scan = MapVirtualKeyW(u32::from(VK_MENU.0), MAPVK_VK_TO_VSC) as u16;
        let key = |flags: KEYBD_EVENT_FLAGS| INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT { wVk: VK_LMENU, wScan: scan, dwFlags: flags, time: 0, dwExtraInfo: 0 },
            },
        };
        SendInput(&[key(KEYEVENTF_EXTENDEDKEY), key(KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP)], std::mem::size_of::<INPUT>() as i32);
        let _ = SetForegroundWindow(h);
    }
}

static DRAGGING: AtomicBool = AtomicBool::new(false);

/// Move the overlay ourselves while the mouse button is held.
/// Windows' own move loop (startDragging) draws a white outline rectangle when "Show window
/// contents while dragging" is off, plus Snap previews, all outside our window, so screen
/// sharing sees them even though the overlay itself is excluded from capture.
pub fn drag(w: &WebviewWindow) {
    if DRAGGING.swap(true, Ordering::SeqCst) {
        return;
    }
    let Some(h) = hwnd(w) else {
        DRAGGING.store(false, Ordering::SeqCst);
        return;
    };
    let raw = h.0 as isize;
    std::thread::spawn(move || {
        let h = HWND(raw as *mut _);
        unsafe {
            let (mut cur, mut rect) = (POINT::default(), RECT::default());
            if GetCursorPos(&mut cur).is_ok() && GetWindowRect(h, &mut rect).is_ok() {
                let (ox, oy) = (cur.x - rect.left, cur.y - rect.top);
                // GetAsyncKeyState reads physical buttons; respect left-handed mouse setups.
                let button = if GetSystemMetrics(SM_SWAPBUTTON) != 0 { VK_RBUTTON } else { VK_LBUTTON };
                let mut last = (rect.left, rect.top);
                while (GetAsyncKeyState(button.0 as i32) as u16 & 0x8000) != 0 {
                    let mut p = POINT::default();
                    if GetCursorPos(&mut p).is_ok() {
                        let next = (p.x - ox, p.y - oy);
                        if next != last {
                            let _ = SetWindowPos(h, None, next.0, next.1, 0, 0, SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE);
                            last = next;
                        }
                    }
                    std::thread::sleep(std::time::Duration::from_millis(6));
                }
            }
        }
        DRAGGING.store(false, Ordering::SeqCst);
    });
}

/// Move and resize in one call, so a panel opening to the left never shows a half-moved frame.
pub fn set_bounds(w: &WebviewWindow, x: i32, y: i32, width: i32, height: i32) {
    if let Some(h) = hwnd(w) {
        unsafe {
            let _ = SetWindowPos(h, None, x, y, width, height, SWP_NOZORDER | SWP_NOACTIVATE);
        }
    }
}

/// Corner resize. Like `drag`, we follow the mouse ourselves instead of Windows' sizing loop
/// (which draws an outline that screen sharing can see). While the button is held, the UI gets
/// "resize-drag" events with the cursor's offset from where it was pressed, in physical pixels;
/// it turns that into a new width/height and the window follows its content.
///
/// Emitted on `w` specifically (not broadcast app-wide): with two independently resizable windows
/// (overlay + code panel), a global emit would make both react to whichever one is being dragged.
pub fn track_resize(w: &WebviewWindow) {
    if DRAGGING.swap(true, Ordering::SeqCst) {
        return;
    }
    let w = w.clone();
    std::thread::spawn(move || {
        unsafe {
            let mut start = POINT::default();
            if GetCursorPos(&mut start).is_ok() {
                let button = if GetSystemMetrics(SM_SWAPBUTTON) != 0 { VK_RBUTTON } else { VK_LBUTTON };
                let mut last = (0, 0);
                while (GetAsyncKeyState(button.0 as i32) as u16 & 0x8000) != 0 {
                    let mut p = POINT::default();
                    if GetCursorPos(&mut p).is_ok() {
                        let d = (p.x - start.x, p.y - start.y);
                        if d != last {
                            let _ = w.emit("resize-drag", serde_json::json!({ "dx": d.0, "dy": d.1, "done": false }));
                            last = d;
                        }
                    }
                    std::thread::sleep(std::time::Duration::from_millis(8));
                }
                let _ = w.emit("resize-drag", serde_json::json!({ "dx": last.0, "dy": last.1, "done": true }));
            }
        }
        DRAGGING.store(false, Ordering::SeqCst);
    });
}

pub fn foreground() -> isize {
    unsafe { GetForegroundWindow().0 as isize }
}

pub fn set_foreground(raw: isize) {
    if raw != 0 {
        unsafe {
            let _ = SetForegroundWindow(HWND(raw as *mut _));
        }
    }
}

pub fn cursor_pos() -> Option<(i32, i32)> {
    let mut p = POINT::default();
    unsafe { GetCursorPos(&mut p).ok()? };
    Some((p.x, p.y))
}

/// Ask Win32, not tao: tao's visibility flag doesn't know about our SW_SHOWNOACTIVATE.
pub fn is_visible(app: &AppHandle) -> bool {
    overlay(app)
        .and_then(|w| hwnd(&w))
        .is_some_and(|h| unsafe { IsWindowVisible(h).as_bool() })
}

/// Show the overlay without taking focus from the app the user is in.
pub fn reveal(app: &AppHandle) {
    let Some(w) = overlay(app) else { return };
    if let Some(h) = hwnd(&w) {
        unsafe {
            let _ = ShowWindow(h, SW_SHOWNOACTIVATE);
        }
    }
    let _ = w.set_always_on_top(true);
    let _ = app.emit("visibility", true);
}

/// Hide via Win32 too: tao's hide() is a no-op because its flag never saw our show.
pub fn conceal(app: &AppHandle) {
    if let Some(h) = overlay(app).and_then(|w| hwnd(&w)) {
        unsafe {
            let _ = ShowWindow(h, SW_HIDE);
        }
    }
    let _ = app.emit("visibility", false);
}
