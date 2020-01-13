/**
 * menu.js
 *
 * Licensed under the MIT License
 *
 * Copyright(c) 2019 Google Inc.
 */

import { EventEmitter } from './event-emitter.js';
import { assert, getElem, Key } from './helpers.js';

const MENU_OPEN_STYLE = 'opacity:0.875;text-align:left;'
const MENU_CLOSED_STYLE = 'display:none;' + MENU_OPEN_STYLE;
const MENU_OVERLAY_OPEN_STYLE = 'position:absolute;bottom:0;left:0;right:0;top:0';
const MENU_OVERLAY_CLOSED_STYLE = 'display:none;' + MENU_OVERLAY_OPEN_STYLE;
const MENU_CONTAINER = 'allMenus';

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
        this.close();
        this.notify(new MenuItemSelectedEvent(this, menuItem));
      })
    }
  }

  close() {
    assert(Menu.openMenus_.has(this), 'Menu was already closed!');
    // TODO: Close all sub / child menus.
    this.dom_.style = MENU_CLOSED_STYLE;
    Menu.Overlay.style = MENU_OVERLAY_CLOSED_STYLE;
    Menu.openMenus_.delete(this);
    this.notify(new MenuCloseEvent(this));
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
    switch (code) {
      case Key.ESCAPE:
      case Key.TAB:
        this.close();
        return true;
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

  // TODO: Allow client to specify position of menu.
  open() {
    assert(!Menu.openMenus_.has(this), 'Menu was already open!');
    Menu.Overlay.style = MENU_OVERLAY_OPEN_STYLE;
    this.dom_.style = MENU_OPEN_STYLE;
    Menu.openMenus_.add(this);
    this.notify(new MenuOpenEvent(this));

    const menuEl = this.dom_.firstElementChild;
    // TODO: Remove checking of style and use a separate data-disabled or disabled attribute.
    const firstMenuElem = menuEl.querySelector('[role="menuitem"]:not([style="display: none;"])');
    firstMenuElem.focus();
  }

  /**
   * Assumes the menu is open.
   * @param {Number} delta Can be negative (up) or positive (down)
   * @private
   */
  selectMenuItem_(delta = 1) {
    const menuEl = this.dom_.firstElementChild;
    // TODO: Remove checking of style and use a separate data-disabled or disabled attribute.
    const menuItems = menuEl.querySelectorAll('[role="menuitem"]:not([style="display: none;"])');
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
    const menuItem = menuEl.querySelector(`[id=${itemId}][role="menuitem"]`);
    assert(!!menuItem, `Could not find menu item ${itemId}`);
    menuItem.style.display = show ? '' : 'none';
  }

  /** @private */
  static createOverlay_() {
    const menuContainer = document.createElement('div');
    menuContainer.id = MENU_CONTAINER;
    document.body.appendChild(menuContainer);

    const overlayEl = document.createElement('div');
    overlayEl.style = MENU_OVERLAY_CLOSED_STYLE;
    overlayEl.addEventListener('click', evt => {
      // Close all open menus.
      for (const menu of Menu.openMenus_.values()) {
        menu.close();
      }
    });
    menuContainer.appendChild(overlayEl);
    return overlayEl;
  }
}

/**
 * @type {Set<Menu>}
 */
Menu.openMenus_ = new Set();

/**
 * This div is used to cover the app's DOM.  Any clicks on it will close all open menus.
 */
Menu.Overlay = Menu.createOverlay_();
