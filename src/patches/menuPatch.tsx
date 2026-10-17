import { FooterLegendProps, afterPatch, findInReactTree } from "decky-frontend-lib"
import { getReactTree, routePath } from "../init"
import { FC, ReactElement, ReactNode, useState } from "react"
import { PluginIcon } from "../components/native-components/PluginIcon"
import { Logger } from '../lib/log'
import { settingsManager } from '../classes/SettingsManager'
import { status } from '../pluginState'
import { killBrowser } from '../lib/utils'
import { tabManager } from '../classes/TabManager'

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
    const menuWrapper = (props: any) => {
        const ret = orig(props)
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

                // Only count static nav entries so running game entries (prepended to the same array) don't shift the position
                const isStaticMenuItemElt = (e: any) => isMenuItemElt(e) && !isRunningAppRoute(e.props.route);
                const itemIndexes = getMenuItemIndexes(menuItems, isStaticMenuItemElt);
                if (!itemIndexes.length) {
                    namedLogger.log('Could not find static menu items to position against.')
                    return ret
                }
                const menuItem = menuItems.find(isStaticMenuItemElt) as { props: MainMenuItemProps, type: () => ReactElement };

                const newItem =
                    <MenuItemWrapper
                        key={'browser'}
                        route={routePath}
                        label='Browser'
                        onFocus={menuItem.props.onFocus}
                        onGamepadFocus={menuItem.props.onGamepadFocus}
                        useIconAsProp={!!menuItem.props.icon}
                        MenuItemComponent={menuItem.type}
                    />

                const browserPosition = settingsManager.settings.menuPosition

                if (browserPosition === 9 || browserPosition > itemIndexes.length) menuItems.splice(itemIndexes[itemIndexes.length - 1] + 1, 0, newItem)
                else menuItems.splice(itemIndexes[browserPosition - 1], 0, newItem)

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
        menuNode.return.type = orig
        menuNode.return.alternate.type = menuNode.return.type;
    }
}

function getMenuItemIndexes(items: any[], isItem: (e: any) => boolean) {
    return items.flatMap((item, index) => (item && item.$$typeof && item.type !== 'div' && isItem(item)) ? index : [])
}

// Running game entries route to the game's page, e.g. /library/app/<appid>
function isRunningAppRoute(route: unknown) {
    return typeof route === 'string' && /\/\d+(\/|$)/.test(route)
}

interface MenuItemWrapperProps extends MainMenuItemProps {
    MenuItemComponent: FC<MainMenuItemProps>;
    useIconAsProp: boolean;
}

const MenuItemWrapper: FC<MenuItemWrapperProps> = ({ MenuItemComponent, label, useIconAsProp, ...props }) => {
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