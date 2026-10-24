use std::sync::Mutex;

use serde::Serialize;
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Runtime, State, WindowEvent,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

const TRAY_ID: &str = "slopcall";
const MUTE_EVENT: &str = "slopcall://toggle-mute";
const DEAFEN_EVENT: &str = "slopcall://toggle-deafen";

const TRAY_INACTIVE: &[u8] = include_bytes!("../icons/tray/slopcall_tray_inactive.png");
const TRAY_CALL: &[u8] = include_bytes!("../icons/tray/slopcall_tray_call.png");
const TRAY_SPEAKING: &[u8] = include_bytes!("../icons/tray/slopcall_tray_speaking.png");
const TRAY_MIC_OFF: &[u8] = include_bytes!("../icons/tray/slopcall_tray_mic_off.png");
const TRAY_SOUND_OFF: &[u8] = include_bytes!("../icons/tray/slopcall_tray_sound_off.png");

#[derive(Clone, Copy, PartialEq, Eq)]
enum TrayVisual {
    Inactive,
    Call,
    Speaking,
    MicOff,
    SoundOff,
}

impl TrayVisual {
    fn bytes(self) -> &'static [u8] {
        match self {
            Self::Inactive => TRAY_INACTIVE,
            Self::Call => TRAY_CALL,
            Self::Speaking => TRAY_SPEAKING,
            Self::MicOff => TRAY_MIC_OFF,
            Self::SoundOff => TRAY_SOUND_OFF,
        }
    }
}

fn tray_visual(mic_muted: bool, deafened: bool, in_voice: bool, speaking: bool) -> TrayVisual {
    if deafened {
        TrayVisual::SoundOff
    } else if mic_muted {
        TrayVisual::MicOff
    } else if in_voice && speaking {
        TrayVisual::Speaking
    } else if in_voice {
        TrayVisual::Call
    } else {
        TrayVisual::Inactive
    }
}

fn tray_tooltip(mic_muted: bool, deafened: bool, in_voice: bool, speaking: bool) -> String {
    if !in_voice {
        return if deafened {
            "Slopcall - audio muted".into()
        } else if mic_muted {
            "Slopcall - mic muted".into()
        } else {
            "Slopcall - mic on, audio on".into()
        };
    }

    let mut status = String::from("Slopcall - in call");
    if deafened {
        status.push_str(", audio muted");
    } else if mic_muted {
        status.push_str(", mic muted");
    } else if speaking {
        status.push_str(", speaking");
    }
    status
}

#[derive(Clone, Serialize)]
struct AudioMenuState {
    mic_muted: bool,
    deafened: bool,
}

struct TrayState {
    mute_item: CheckMenuItem<tauri::Wry>,
    deafen_item: CheckMenuItem<tauri::Wry>,
    last_visual: Mutex<Option<TrayVisual>>,
}

fn show_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[tauri::command]
fn set_audio_state(
    app: AppHandle,
    state: State<'_, TrayState>,
    mic_muted: bool,
    deafened: bool,
    in_voice: bool,
    speaking: bool,
) -> Result<(), String> {
    state
        .mute_item
        .set_checked(mic_muted)
        .map_err(|error| error.to_string())?;
    state
        .deafen_item
        .set_checked(deafened)
        .map_err(|error| error.to_string())?;

    let visual = tray_visual(mic_muted, deafened, in_voice, speaking);
    let tooltip = tray_tooltip(mic_muted, deafened, in_voice, speaking);

    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let mut last_visual = state
            .last_visual
            .lock()
            .map_err(|_| "tray state lock poisoned".to_string())?;

        if *last_visual != Some(visual) {
            let icon = tauri::image::Image::from_bytes(visual.bytes())
                .map_err(|error| error.to_string())?;
            tray.set_icon(Some(icon))
                .map_err(|error| error.to_string())?;
            *last_visual = Some(visual);
        }

        drop(last_visual);
        tray.set_tooltip(Some(tooltip))
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

#[tauri::command]
fn current_audio_state(state: State<'_, TrayState>) -> AudioMenuState {
    AudioMenuState {
        mic_muted: state.mute_item.is_checked().unwrap_or(false),
        deafened: state.deafen_item.is_checked().unwrap_or(false),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main(app);
        }))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let open_item =
                MenuItem::with_id(app, "open", "Open Slopcall", true, None::<&str>)?;
            let mute_item = CheckMenuItem::with_id(
                app,
                "toggle-mute",
                "Mute microphone",
                true,
                false,
                None::<&str>,
            )?;
            let deafen_item = CheckMenuItem::with_id(
                app,
                "toggle-deafen",
                "Deafen",
                true,
                false,
                None::<&str>,
            )?;
            let quit_item =
                MenuItem::with_id(app, "quit", "Quit Slopcall", true, None::<&str>)?;
            let first_separator = PredefinedMenuItem::separator(app)?;
            let second_separator = PredefinedMenuItem::separator(app)?;

            let menu = Menu::with_items(
                app,
                &[
                    &open_item,
                    &first_separator,
                    &mute_item,
                    &deafen_item,
                    &second_separator,
                    &quit_item,
                ],
            )?;

            let mut tray = TrayIconBuilder::with_id(TRAY_ID)
                .icon(tauri::image::Image::from_bytes(TRAY_INACTIVE)?)
                .tooltip("Slopcall - mic on, audio on")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show_main(app),
                    "toggle-mute" => {
                        let _ = app.emit(MUTE_EVENT, ());
                    }
                    "toggle-deafen" => {
                        let _ = app.emit(DEAFEN_EVENT, ());
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::DoubleClick {
                        button: MouseButton::Left,
                        ..
                    } = event
                    {
                        show_main(tray.app_handle());
                    }
                });

            if !cfg!(target_os = "linux") {
                tray = tray.tooltip("Slopcall - mic on, audio on");
            }

            tray.build(app)?;

            app.manage(TrayState {
                mute_item,
                deafen_item,
                last_visual: Mutex::new(Some(TrayVisual::Inactive)),
            });

            let mute_shortcut =
                Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyM);
            let deafen_shortcut =
                Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyD);

            if let Err(error) = app.global_shortcut().on_shortcut(
                mute_shortcut,
                |app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        let _ = app.emit(MUTE_EVENT, ());
                    }
                },
            ) {
                log::warn!("failed to register Ctrl+Shift+M: {error}");
            }

            if let Err(error) = app.global_shortcut().on_shortcut(
                deafen_shortcut,
                |app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        let _ = app.emit(DEAFEN_EVENT, ());
                    }
                },
            ) {
                log::warn!("failed to register Ctrl+Shift+D: {error}");
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            set_audio_state,
            current_audio_state
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tray_visual_uses_the_expected_priority() {
        assert!(matches!(
            tray_visual(true, true, true, true),
            TrayVisual::SoundOff
        ));
        assert!(matches!(
            tray_visual(true, false, true, true),
            TrayVisual::MicOff
        ));
        assert!(matches!(
            tray_visual(false, false, true, true),
            TrayVisual::Speaking
        ));
        assert!(matches!(
            tray_visual(false, false, true, false),
            TrayVisual::Call
        ));
        assert!(matches!(
            tray_visual(false, false, false, false),
            TrayVisual::Inactive
        ));
    }

    #[test]
    fn tray_tooltip_reflects_voice_and_audio_state() {
        assert_eq!(
            tray_tooltip(false, false, false, false),
            "Slopcall - mic on, audio on"
        );
        assert_eq!(
            tray_tooltip(false, false, true, true),
            "Slopcall - in call, speaking"
        );
        assert_eq!(
            tray_tooltip(true, false, true, false),
            "Slopcall - in call, mic muted"
        );
        assert_eq!(
            tray_tooltip(false, true, true, false),
            "Slopcall - in call, audio muted"
        );
    }

    #[test]
    fn tray_icons_decode_at_32_pixels_with_transparency() {
        for bytes in [
            TRAY_INACTIVE,
            TRAY_CALL,
            TRAY_SPEAKING,
            TRAY_MIC_OFF,
            TRAY_SOUND_OFF,
        ] {
            let image = tauri::image::Image::from_bytes(bytes).expect("tray PNG should decode");
            assert_eq!(image.width(), 32);
            assert_eq!(image.height(), 32);
            assert_eq!(image.rgba().len(), 32 * 32 * 4);
            assert!(
                image.rgba().chunks_exact(4).any(|pixel| pixel[3] < 255),
                "tray icon should contain transparent pixels"
            );
        }
    }
}
