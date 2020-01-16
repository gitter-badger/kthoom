/**
 * menu.js
 *
 * Licensed under the MIT License
 *
 * Copyright(c) 2019 Google Inc.
 */

import { EventEmitter } from './event-emitter.js';
import { assert, getElem, Key } from './helpers.js';

const MENU_OPEN_STYLE = 'position:absolute;opacity:0.875;text-align:left;'
const MENU_CLOSED_STYLE = 'display:none;' + MENU_OPEN_STYLE;
const MENU_OVERLAY_OPEN_STYLE = 'position:absolute;bottom:0;left:0;right:0;top:0;';
const MENU_OVERLAY_CLOSED_STYLE = 'display:none;' + MENU_OVERLAY_OPEN_STYLE;
const MENU_CONTAINER = 'allMenus';

/**
 * @type {Set<Menu>}
 */
const openMenus = new Set();

function createOverlay() {
  const menuContainer = document.createElement('div');
  menuContainer.id = MENU_CONTAINER;
  document.body.appendChild(menuContainer);

  const overlayEl = document.createElement('div');
  overlayEl.style = MENU_OVERLAY_CLOSED_STYLE;
  overlayEl.addEventListener('click', evt => {
    // Close all open menus.
    for (const menu of openMenus.values()) {
      menu.close();
    }
  });
  menuContainer.appendChild(overlayEl);
  return overlayEl;
}

/**
 * This div is used to cover the app's DOM.  Any clicks on it will close all open menus.
 */
const overlay = createOverlay();


/** @type {Object<String, String>} */
export const MenuEventType = {
  UNKNOWN: 'menu-unknown-event',
  CLOSE: 'menu-close',
  ITEM_SELECTED: 'menu-item-select',
  OPEN: 'menu-open',
};

export class MenuEvent {
  constructor(menu, type = MenuEventType.UNKNOWN) {
    this.menu = menu;
    this.type = type;
  }
}

export class MenuOpenEvent extends MenuEvent {
  constructor(menu) {
    super(menu, MenuEventType.OPEN);
  }
}

export class MenuCloseEvent extends MenuEvent {
  constructor(menu) {
    super(menu, MenuEventType.CLOSE);
  }
}

export class MenuItemSelectedEvent extends MenuEvent {
  /**
   * @param {Menu} menu 
   * @param {Element} item 
   */
  constructor(menu, item) {
    super(menu, MenuEventType.ITEM_SELECTED);
    /** @type {Element} */
    this.item = item;
  }
}


/**
 * A menu owns its DOM, is constructed from a list of menu items and manages rendering and
 * interaction.  Clients create menus and add event listeners for when menu items are selected.
 */
export class Menu extends EventEmitter {
  /**
   * @param {HTMLTemplateElement} templateEl 
   */
  constructor(templateEl) {
    super();

    this.dom_ = undefined;
    this.createDom_(templateEl);

    /** @private {Map<string, Menu>} */
    this.subMenuMap_ = new Map();

    /** @private {Menu} */
    this.openedSubMenu_ = null;
  }

  /**
   * @param {string} menuItemId
   * @param {Menu} subMenu
   */
  addSubMenu(menuItemId, subMenu) {
    assert(!Array.from(this.subMenuMap_.values()).includes(subMenu), 'Submenu already part of this menu.');
    assert(!this.subMenuMap_.has(menuItemId), `Menu already has a submenu mappeed for ${menuItemId}`);
    const menuEl = this.dom_.firstElementChild;
    const menuItem = menuEl.querySelectorAll(`[id="${menuItemId}"][role="menuitem"]`);
    assert(!!menuItem, `Menu item "${menuItemId} not found in menu`);

    this.subMenuMap_.set(menuItemId, subMenu);
  }

  /**
   * If the last menu is closed, the menu overlay is also hidden.
   */
  close() {
    assert(openMenus.has(this), 'Menu was already closed!');
    if (this.openedSubMenu_) {
      if (this.openedSubMenu_.isOpen()) {
        this.openedSubMenu_.close();
      }
      this.openedSubMenu_ = null;
    }

    this.dom_.style = MENU_CLOSED_STYLE;
    openMenus.delete(this);
    this.notify(new MenuCloseEvent(this));

    if (openMenus.size === 0) {
      overlay.style = MENU_OVERLAY_CLOSED_STYLE;
    }
  }

  /**
   * @param {HTMLTemplateElement} templateEl
   * @private
   */
  createDom_(templateEl) {
    assert(!this.dom_, 'DOM for Menu was already created when createDom_() was called');

    this.dom_ = document.createElement('div');
    this.dom_.style = MENU_CLOSED_STYLE;
    this.dom_.appendChild(document.importNode(templateEl.content, true));

    // TODO: Do some validation on the DOM here.
    getElem(MENU_CONTAINER).appendChild(this.dom_);

    // Add all click listeners here.
    const menuEl = this.dom_.firstElementChild;
    for (const menuItem of menuEl.querySelectorAll('[role="menuitem"]')) {
      menuItem.addEventListener('click', evt => {
        const menuItemId = menuItem.id;
        let previouslyOpenedSubMenu = null;
        if (this.openedSubMenu_) {
          if (this.openedSubMenu_.isOpen()) {
            previouslyOpenedSubMenu = this.openedSubMenu_;
            this.openedSubMenu_.close();
          }
          this.openedSubMenu_ = null;
        }
        if (this.subMenuMap_.has(menuItemId)) {
          const maybeOpenSubMenu = this.subMenuMap_.get(menuItemId);
          const menuItemEl = evt.target;
          if (maybeOpenSubMenu !== previouslyOpenedSubMenu) {
            menuItemEl.setAttribute('aria-expanded', 'true');
            this.openedSubMenu_ = maybeOpenSubMenu;
            this.openedSubMenu_.open(menuItemEl.offsetWidth, menuItemEl.offsetTop);
          } else {
            menuItemEl.setAttribute('aria-expanded', 'false');
            menuItemEl.focus();
            this.notify(new MenuItemSelectedEvent(this, menuItem));
          }
        } else {
          this.close();
          this.notify(new MenuItemSelectedEvent(this, menuItem));
        }
      });
    }
  }

  /**
   * @param {KeyboardEvent} evt
   * @return {boolean} True if the event was handled.
   */
  handleKeyEvent(evt) {
    if (!this.isOpen()) {
      return false;
    }

    const code = evt.keyCode;

    const closeKeys = [Key.ESCAPE, Key.TAB, Key.LEFT];
    if (this.openedSubMenu_ && !closeKeys.includes(code)) {
      return this.openedSubMenu_.handleKeyEvent(evt);
    }

    if (closeKeys.includes(code)) {
      if (this.openedSubMenu_) {
        if (this.openedSubMenu_.isOpen()) {
          this.openedSubMenu_.close();
        }
        // Find the appropriate menu item and focus is.
        for (const menuItemId of this.subMenuMap_.keys()) {
          const subMenu = this.subMenuMap_.get(menuItemId);
          if (subMenu === this.openedSubMenu_) {
            const menuItem = getElem(menuItemId);
            menuItem.setAttribute('aria-expanded', 'false');
            menuItem.focus();
            break;
          }
        }
        this.openedSubMenu_ = null;
      } else {
        this.close();
      }
      return true;
    }

    switch (code) {
      case Key.UP:
        evt.preventDefault();
        evt.stopPropagation();
        this.selectMenuItem_(-1);
        return true;
      case Key.DOWN:
        evt.preventDefault();
        evt.stopPropagation();
        this.selectMenuItem_(1);
        return true;
      case Key.RIGHT:
        const currentlyFocusedMenuItem = document.activeElement;
        const menuItemId = currentlyFocusedMenuItem.id;
        if (this.subMenuMap_.has(menuItemId)) {
          const subMenu = this.subMenuMap_.get(menuItemId);
          subMenu.open(currentlyFocusedMenuItem.offsetWidth, currentlyFocusedMenuItem.offsetTop);
          this.openedSubMenu_ = subMenu;
          return true;
        }
        break;
      case Key.ENTER:
        // We need to return true so that the event propagates up to the browser with the menu item
        // still focused so that a 'click' event occurs.  The click handler closes the menu.
        return true;
    }
    // Otherwise, the menu did not process the event and something above us should.
    this.close();
    return false;
  }

  /** @return {boolean} */
  isOpen() {
    return !(this.dom_.style.display === 'none');
  }

  /**
   * @param {number} left The left px value.
   * @param {number} top The top px value.
   */
  open(left = 0, top = 0) {
    assert(!openMenus.has(this), 'Menu was already open!');
    overlay.style = MENU_OVERLAY_OPEN_STYLE;
    const style = MENU_OPEN_STYLE + `left:${left}px;top:${top}px;`;
    this.dom_.style = style;
    openMenus.add(this);
    this.notify(new MenuOpenEvent(this));

    const menuEl = this.dom_.firstElementChild;
    const firstMenuElem = menuEl.querySelector('[role="menuitem"]:not([disabled="true"])');
    firstMenuElem.focus();
  }

  /**
   * Assumes the menu is open.
   * @param {Number} delta Can be negative (up) or positive (down)
   * @private
   */
  selectMenuItem_(delta = 1) {
    const menuEl = this.dom_.firstElementChild;
    const menuItems = menuEl.querySelectorAll('[role="menuitem"]:not([disabled="true"])');
    const numMenuItems = menuItems.length;
    const currentlyFocusedMenuItem = document.activeElement;
    let i = 0;
    for ( ; i < numMenuItems; ++i) {
      const menuItem = menuItems.item(i);
      if (menuItem === currentlyFocusedMenuItem) {
        break;
      }
    }
    // If somehow the currently focused item is not in the menu, then start at the top of the menu.
    if (i === menuItems.length) {
      i = 0;
    }

    i += delta;
    while (i >= numMenuItems) {
      i -= numMenuItems;
    }
    while (i < 0) {
      i += numMenuItems;
    }

    const newlySelectedMenuItem = menuItems.item(i);
    newlySelectedMenuItem.focus();
  }

  /**
   * @param {string} itemId 
   * @param {boolean} show True to show, false to hide.
   */
  showMenuItem(itemId, show) {
    const menuEl = this.dom_.firstElementChild;
    const menuItem = menuEl.querySelector(`[id="${itemId}"][role="menuitem"]`);
    assert(!!menuItem, `Could not find menu item ${itemId}`);
    menuItem.style.display = show ? '' : 'none';
    if (show) {
      menuItem.removeAttribute('disabled');
    } else {
      menuItem.setAttribute('disabled', 'true');
    }
  }
}
