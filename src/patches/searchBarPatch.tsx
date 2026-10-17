import { findInReactTree, sleep } from "decky-frontend-lib"
import { tabManager } from "../classes/TabManager"
import { SearchBarInput } from "../components/SearchBarInput"
import { SearchBarErrorBoundary } from "../components/SearchBarErrorBoundary"
import { FocusableInput } from "../components/native-components/FocusableInput"
import { getReactTree, routePath } from "../init"
import { logN } from '../lib/log'
import { browserClasses, searchBarClasses } from '../lib/staticClasses'

export const searchBarState = { useFallbackSearch: true, isInitPatched: false, hasCrashed: false, rootNodeOriginal: ((() => { }) as (props: any) => any) }

// Steam internals the custom search bar depends on; any of these can disappear after a client update
const getMissingDependencies = () => Object.entries({ FocusableInput, searchBarClasses, browserClasses }).flatMap(([name, dep]) => dep ? [] : name)

export let unpatchSearchBar: () => void = () => { }
export const patchSearchBar = async () => {
    searchBarState.useFallbackSearch = true
    let searchBarRootNode: any
    let t = 0
    while (!searchBarRootNode) {
        searchBarRootNode = findInReactTree(getReactTree(), node => node?.type?.toString().includes('SetUniversalSearchFocused') && node?.type?.toString().includes('GetForceHeaderAfterResume'))
        if (searchBarRootNode) continue
        if (t >= 20000) {
            logN('Search Bar Patch', `Failed to find search bar root node after ${t / 1000} sec.`)
            return
        }
        t += 200
        await sleep(200)
    }
    const missingDependencies = getMissingDependencies()
    if (missingDependencies.length) {
        logN('Search Bar Patch', `Could not find Steam components (${missingDependencies.join(', ')}), using fallback search.`)
        return
    }
    if (!searchBarState.isInitPatched) searchBarState.rootNodeOriginal = searchBarRootNode.type
    const searchBarRootWrapper = (props: any) => {
        const ret = searchBarState.rootNodeOriginal(props)
        if (window.location.pathname === '/routes' + routePath && !searchBarState.hasCrashed) {
            const res = findLocation(ret, node => {
                if (!node.type) return false
                const fnString = node.type.toString?.()
                return fnString?.includes('GamepadUI.Search.Root') && fnString?.includes('SearchBox')
            })
            if (res) {
                const [parent, key] = res
                parent[key] = (
                    <SearchBarErrorBoundary
                        fallback={parent[key]}
                        onError={() => {
                            searchBarState.hasCrashed = true
                            searchBarState.useFallbackSearch = true
                        }}
                    >
                        <SearchBarInput tabManager={tabManager} />
                    </SearchBarErrorBoundary>
                )
                searchBarState.useFallbackSearch = false
            } else {
                logN("Search Bar Patch", 'Failed to find search bar element to patch.')
                searchBarState.useFallbackSearch = true
            }
        }
        return ret
    }
    searchBarRootNode.type = searchBarRootWrapper
    if (searchBarRootNode.alternate) {
        searchBarRootNode.alternate.type = searchBarRootNode.type;
    }
    searchBarState.isInitPatched = true


    unpatchSearchBar = () => {
        try {
            searchBarRootNode.type = searchBarState.rootNodeOriginal
            searchBarRootNode.alternate.type = searchBarRootNode.type;
        } catch { }
    }
}

const findLocation = (parent, filter) => {
    const walkable = ['props', 'children']
    if (!parent || typeof parent !== 'object') return
    if (Array.isArray(parent)) {
        for (let i = 0; i < parent.length; i++) {
            if (!parent[i]) continue
            if (filter(parent[i])) return [parent, i]
        }
        for (let i = 0; i < parent.length; i++) {
            if (!parent[i]) continue
            const next = findLocation(parent[i], filter)
            if (next) return next
        }
    } else {
        for (const prop of walkable) {
            if (!parent[prop]) continue
            if (filter(parent[prop])) return [parent, prop]
        }

        for (const prop of walkable) {
            if (!parent[prop]) continue
            const next = findLocation(parent[prop], filter)
            if (next) return next
        }
    }
} 