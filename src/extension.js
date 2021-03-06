/*
 * GNOME Shell Extension: Super+Tab Launcher
 * Copyright (C) 2018  Davi da Silva Böger
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

const SwitcherPopup = imports.ui.switcherPopup;
const AltTab = imports.ui.altTab;
const AppFavorites = imports.ui.appFavorites;
const Shell = imports.gi.Shell;

function openNewAppWindow(app) {
    if (app.get_n_windows() == 0) {
        app.launch(0, -1, false);
    } else {
        let appInfo = app.get_app_info();
        if (appInfo.list_actions().indexOf('new-window') >= 0) {
            appInfo.launch_action('new-window', null);
        } else {
            app.open_new_window(-1);
        }
    }
}

function addLauncherForApp(app, switcher) {
    let appIcon = new AltTab.AppIcon(app);
    if (appIcon.actor) { // compatibility with <= 3.30.1
        appIcon.actor.add_style_class_name('super-tab-launcher');
        appIcon.actor.opacity = 128; // cannot set opacity through CSS?
    } else {
        appIcon.add_style_class_name('super-tab-launcher');
        appIcon.opacity = 128; // cannot set opacity through CSS?
    }
    appIcon.cachedWindows = ["Hi, I'm a window!"]; // hack to hide the arrow
    switcher._addIcon(appIcon); // TODO add in the right position
    appIcon.cachedWindows = [];
    // do not remove icon when non-running app stops running...
    appIcon.app.disconnect(appIcon._stateChangedId);
    // ... but remove when it starts running
    appIcon._stateChangedId = appIcon.app.connect('notify::state', app => {
            if (app.state == Shell.AppState.RUNNING) {
                switcher._removeIcon(app);
            }
        });
    return appIcon;
}


let AppSwitcher_init_orig;
let AppSwitcher_removeIcon_orig;
let AppSwitcherPopup_init_orig;
let AppSwitcherPopup_initialSelection_orig;
let AppSwitcherPopup_select_orig;
let AppSwitcherPopup_finish_orig;

const AppSwitcher_init_mod = function(apps, altTabPopup) {
    AppSwitcher_init_orig.apply(this, [apps, altTabPopup]);
    // addedApps may differ from apps if 'current-workspace-only' is set
    let addedApps = this.icons.map(function(i) { return i.app; });
    let favorites = AppFavorites.getAppFavorites().getFavorites();
    for (let i in favorites) {
        let favoriteApp = favorites[i];
        if (addedApps.indexOf(favoriteApp) < 0) {
            addLauncherForApp(favoriteApp, this);
        }
    }
}

const AppSwitcher_removeIcon_mod = function(app) {
    AppSwitcher_removeIcon_orig.apply(this, [app]);
    // we may be removing a launcher, so check if app is runnning
    if (app.state != Shell.AppState.RUNNING) {
        let favorites = AppFavorites.getAppFavorites().getFavorites();
        let favIndex = favorites.indexOf(app);
        if (favIndex >= 0) {
            let appIcon = addLauncherForApp(app, this);
            appIcon.set_size(this._iconSize);
        }
    }
}

const AppSwitcherPopup_init_mod = function() {
    AppSwitcherPopup_init_orig.apply(this, []);
    if (this._switcherList == undefined) {
        // we know there are no running apps, as we have no _switcherList
        this._switcherList = new AltTab.AppSwitcher([], this);
        this._items = this._switcherList.icons;
    }
}

const AppSwitcherPopup_initialSelection_mod = function(backward, binding) {
    if (binding == 'switch-applications') {
        // favorites are always added after running apps, so if first icon has no windows,
        // there are no running apps
        if (this._items[0].cachedWindows.length == 0) {
            this._select(0);
            return;
        }

        if (this._items.length > 1 && this._items[1].cachedWindows.length == 0) {
            let firstAppHasFocus = false;
            for (let window of this._items[0].app.get_windows()) {
                if (window.has_focus()) {
                    firstAppHasFocus = true;
                    break;
                }
            }
            if (!firstAppHasFocus) {
                this._select(0);
                return;
            }
        }
    }
    AppSwitcherPopup_initialSelection_orig.apply(this, [backward, binding]);
}

const AppSwitcherPopup_select_mod = function(app, window, forceAppFocus) {
    let appIcon = this._items[app];
    if (appIcon.cachedWindows.length == 0) {
        // force not to show window thumbnails if app has no windows
        window = null;
        forceAppFocus = true;
    }
    AppSwitcherPopup_select_orig.apply(this, [app, window, forceAppFocus]);
}

const AppSwitcherPopup_finish_mod = function(timestamp) {
    let appIcon = this._items[this._selectedIndex];
    if (appIcon.cachedWindows.length == 0) {
        // if app has no windows, launch it
        // we do not activate() to respect 'current-workspace-only' setting
        openNewAppWindow(appIcon.app);
        SwitcherPopup.SwitcherPopup.prototype._finish.apply(this, [timestamp]);
    } else {
        AppSwitcherPopup_finish_orig.apply(this, [timestamp]);
    }
}

function init(metadata) {
}

function enable() {
    AppSwitcher_init_orig = AltTab.AppSwitcher.prototype._init;
    AltTab.AppSwitcher.prototype._init = AppSwitcher_init_mod;

    AppSwitcher_removeIcon_orig = AltTab.AppSwitcher.prototype._removeIcon;
    AltTab.AppSwitcher.prototype._removeIcon = AppSwitcher_removeIcon_mod;

    AppSwitcherPopup_init_orig = AltTab.AppSwitcherPopup.prototype._init;
    AltTab.AppSwitcherPopup.prototype._init = AppSwitcherPopup_init_mod;

    AppSwitcherPopup_initialSelection_orig = AltTab.AppSwitcherPopup.prototype._initialSelection;
    AltTab.AppSwitcherPopup.prototype._initialSelection = AppSwitcherPopup_initialSelection_mod;

    AppSwitcherPopup_select_orig = AltTab.AppSwitcherPopup.prototype._select;
    AltTab.AppSwitcherPopup.prototype._select = AppSwitcherPopup_select_mod;

    AppSwitcherPopup_finish_orig = AltTab.AppSwitcherPopup.prototype._finish;
    AltTab.AppSwitcherPopup.prototype._finish = AppSwitcherPopup_finish_mod;
}

function disable() {
    AltTab.AppSwitcher.prototype._init = AppSwitcher_init_orig;
    AppSwitcher_init_orig = null;

    AltTab.AppSwitcher.prototype._removeIcon = AppSwitcher_removeIcon_orig;
    AppSwitcher_removeIcon_orig = null;

    AltTab.AppSwitcherPopup.prototype._init = AppSwitcherPopup_init_orig;
    AppSwitcherPopup_init_orig = null;

    AltTab.AppSwitcherPopup.prototype._initialSelection = AppSwitcherPopup_initialSelection_orig;
    AppSwitcherPopup_initialSelection_orig = null;

    AltTab.AppSwitcherPopup.prototype._select = AppSwitcherPopup_select_orig;
    AppSwitcherPopup_select_orig = null;

    AltTab.AppSwitcherPopup.prototype._finish = AppSwitcherPopup_finish_orig;
    AppSwitcherPopup_finish_orig = null;
}

