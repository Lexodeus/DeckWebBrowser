import { FooterLegendProps, afterPatch, findInReactTree } from "decky-frontend-lib"
import { getReactTree, routePath } from "../init"
import { FC, ReactElement, ReactNode, useState } from "react"
import { PluginIcon } from "../components/native-components/PluginIcon"
import { Logger } from '../lib/log'
import { settingsManager } from '../classes/SettingsManager'
import { status } from '../pluginState'
import { killBrowser } from '../lib/utils'
import { tabManager } from '../classes/TabManager'
import { isMenuEntry, placePositionedMenuItems } from './menuOrder'

interface MainMenuItemPropsBase {
    route: string
    label: ReactNode
    onFocus?: () => void
    onGamepadFocus?: () => void
    icon?: ReactElement
    onActivate?: () => void
}

type MainMenuItemProps = MainMenuItemPropsBase & FooterLegendProps;

const namedLogger = new Logger('Menu Patch');

export const patchMenu = () => {
    const menuNode = findInReactTree(getReactTree(), (node) => node?.memoizedProps?.navID == 'MainNavMenuContainer')
    if (!menuNode || !menuNode.return?.type) {
        namedLogger.log('Failed to find main menu root node.')
        return () => { }
    }
    const orig = menuNode.return.type
    let patchedInnerMenu: any
    let unpatched = false
    const menuWrapper = (props: any) => {
        const ret = orig(props)
        // Another plugin wrapped the menu after this one and still calls through, so stay as a pass-through
        if (unpatched) return ret
        if (!ret?.props?.children?.props?.children?.[0]?.type) {
            namedLogger.log('The main menu element could not be found at the expected location. Valve may have changed it.')
            return ret
        }
        if (patchedInnerMenu) {
            ret.props.children.props.children[0].type = patchedInnerMenu
        } else {
            afterPatch(ret.props.children.props.children[0], 'type', (_: any, ret: any) => {
                const isMenuItemElt = (e: any) => e.props?.label && (e.props.onFocus || e.props.onGamepadFocus) && e.props.route && e.type?.toString;
                const menuItems = findInReactTree(ret, node => Array.isArray(node) && node.some(isMenuItemElt)) as Array<any>;
                
                if (!menuItems) {
                    namedLogger.log('Could not find menu items to patch.')
                    return ret
                }

                if (!menuItems.some((item: any) => item?.key === 'browser')) {
                    // Steam's own entries with a route (not running games) render with the component to copy
                    const menuItem = menuItems.find((e: any) => isMenuItemElt(e) && isMenuEntry(e)) as { props: MainMenuItemProps, type: () => ReactElement } | undefined;
                    if (!menuItem) {
                        namedLogger.log('Could not find a menu item to copy.')
                        return ret
                    }
                    menuItems.push(
                        <MenuItemWrapper
                            key={'browser'}
                            route={routePath}
                            label='Browser'
                            menuPosition={settingsManager.settings.menuPosition}
                            onFocus={menuItem.props.onFocus}
                            onGamepadFocus={menuItem.props.onGamepadFocus}
                            useIconAsProp={!!menuItem.props.icon}
                            MenuItemComponent={menuItem.type}
                        />
                    )
                }
                const siblings = findInReactTree(ret, (node) => Array.isArray(node) && node.includes(menuItems)) as any[]
                placePositionedMenuItems(menuItems, siblings)

                return ret
            })
            patchedInnerMenu = ret.props.children.props.children[0].type
        }
        return ret
    }
    menuNode.return.type = menuWrapper
    if (menuNode.return.alternate) {
        menuNode.return.alternate.type = menuNode.return.type;
    }

    return () => {
        unpatched = true
        // Restoring orig here would also drop the wrappers of plugins that patched after this one
        if (menuNode.return.type !== menuWrapper) return
        menuNode.return.type = orig
        if (menuNode.return.alternate) {
            menuNode.return.alternate.type = menuNode.return.type;
        }
    }
}

export interface MenuEntryInfo {
    /** Its position as menuPosition counts it: every entry in the menu other than Browser, from 1 */
    position: number
    label: string
    /** False when a theme hides it */
    visible: boolean
}

// The menu's entries and grouping divs are plain children of this element (see menuOrder.ts)
function findEntriesElementFiber(fiber: any, depth = 0): any {
    for (let f = fiber; f && depth < 12; f = f.sibling) {
        const children = f.memoizedProps?.children
        if (typeof f.type === 'string' && Array.isArray(children) && Array.isArray(children[0])) return f
        const found = findEntriesElementFiber(f.child, depth + 1)
        if (found) return found
    }
    return undefined
}

/**
 * The Steam menu's entries as last rendered, with whether each is visible. Read from the rendered menu, so it
 * includes other plugins' entries and reflects theme hiding. Undefined if the menu can't be read.
 */
export function readMenuEntries(): MenuEntryInfo[] | undefined {
    try {
        const menuNode = findInReactTree(getReactTree(), (node) => node?.memoizedProps?.navID == 'MainNavMenuContainer')
        const fiber = findEntriesElementFiber(menuNode?.child)
        const element = fiber?.stateNode as HTMLElement | undefined
        if (!element) return undefined

        // Elements in render order, with the plugin groups opened up
        const flatten = (nodes: any[]): any[] =>
            nodes.flatMap((e) =>
                Array.isArray(e) ? flatten(e) : typeof e?.key === 'string' && e.key.startsWith('menu-plugins-group:') ? flatten(e.props.children) : [e]
            )
        const rendered = flatten(fiber.memoizedProps.children).filter(
            (e) => e?.props?.label && (e.props.onFocus || e.props.onGamepadFocus)
        )
        const items = Array.from(element.querySelectorAll<HTMLElement>('[role=menuitem]'))
        if (items.length !== rendered.length) return undefined

        const view = element.ownerDocument.defaultView ?? window
        const entries: MenuEntryInfo[] = []
        rendered.forEach((e, index) => {
            if (!isMenuEntry(e) || e.key === 'browser') return
            entries.push({
                position: entries.length + 1,
                label: items[index].textContent?.trim() || (typeof e.props.label === 'string' ? e.props.label : '?'),
                visible: view.getComputedStyle(items[index]).display !== 'none',
            })
        })
        return entries
    } catch (e) {
        namedLogger.log("Couldn't read the menu's entries:", e)
        return undefined
    }
}

interface MenuItemWrapperProps extends MainMenuItemProps {
    menuPosition: number;
    MenuItemComponent: FC<MainMenuItemProps>;
    useIconAsProp: boolean;
}

const MenuItemWrapper: FC<MenuItemWrapperProps> = ({ MenuItemComponent, label, useIconAsProp, menuPosition: _menuPosition, ...props }) => {
    const [_, setState] = useState(false)

    const labelElement = (
        <div style={{ display: 'flex', width: '150px', justifyContent: 'space-between' }}>
            <div>{label}</div>
            <div style={{ fontSize: '11px' }}>{(status.running && tabManager.tabHandlers.length) || ''}</div>
        </div>
    );

    props[useIconAsProp ? 'icon' : 'children'] = <PluginIcon style={status.running ? { filter: 'drop-shadow(rgb(50, 255, 180) 0px 0px 8px)' } : {}} />;

    return (
        <MenuItemComponent
            {...props}
            label={labelElement}
            onSecondaryActionDescription={status.running ? 'Kill Browser' : ''}
            onSecondaryButton={status.running ? () => killBrowser(() => setState((state => !state))) : undefined}
        />
    )
}