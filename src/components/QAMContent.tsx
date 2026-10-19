import { PanelSection, PanelSectionRow, Field, GamepadEvent, GamepadButton, showModal, ButtonItem, DropdownItem, ToggleField } from "decky-frontend-lib";
import { VFC, useMemo, useState } from "react";
import { defaultUrl } from "../init";
import { LAST_MENU_POSITION, SearchEngine, settingsManager } from "../classes/SettingsManager";
import { readMenuEntries } from '../patches/menuPatch';
import { ReorderableEntry, ReorderableList } from "./ReorderableListModified";
import { ConfirmDeleteDefaultTabModal } from "./ConfrimationModals";
import { EnhancedSelector } from './generic/EnhancedSelector';
import { status } from '../pluginState';
import { killBrowser, openUrl } from '../lib/utils';
import { CustomSearchUrlModal } from './CustomSearchUrlModal';
import { SiGithub, SiKofi } from "react-icons/si";
import { SocialButton } from './SocialButton';

/**
 * One option per spot between the entries you can see in the Steam menu. Entries a theme hides are skipped: Browser
 * goes above the next visible entry either way.
 */
function readMenuPositionOptions() {
    const entries = readMenuEntries()?.filter((entry) => entry.visible)
    if (!entries?.length) {
        // The menu couldn't be read: plain numbers for Steam's 8 entries
        return [
            ...Array.from({ length: 8 }, (_, i) => ({ data: i + 1, label: `${i + 1}` })),
            { data: LAST_MENU_POSITION, label: '9' },
        ]
    }
    return [
        ...entries.map((entry, i) => ({ data: entry.position, label: `${i + 1}` })),
        { data: LAST_MENU_POSITION, label: `${entries.length + 1}` },
    ]
}

export const QAMContent: VFC = ({ }) => {
    const [isRunning, setIsRunning] = useState(status.running)
    // Read when the panel opens, so it matches the menu as it is now
    const [menuPositionOptions] = useState(readMenuPositionOptions)
    const [menuPosition, setMenuPosition] = useState(settingsManager.settings.menuPosition)
    // A saved position above a hidden entry shows as the next visible spot, where Browser actually appears
    const selectedMenuPosition = menuPositionOptions.find((option) => option.data >= menuPosition) ?? menuPositionOptions[menuPositionOptions.length - 1]
    const defaultTabItems = useMemo(() => {
        const items: ReorderableEntry<{ tab: string }>[] = []
        for (let i = 0; i < settingsManager.settings.defaultTabs.length; i++) {
            const tab = settingsManager.settings.defaultTabs[i]
            const label = tab === 'home' ? 'Home Page' : tab
            items.push(
                {
                    description: (
                        <div style={{ wordBreak: 'break-all', marginTop: '-8px' }}>
                            {label}
                        </div>),
                    data: {
                        tab: tab
                    },
                    position: i
                }
            )
        }
        return items
    }, [settingsManager.settings.defaultTabs.length])

    return (
        <>
            {!settingsManager.settingsLoaded ?
                (<PanelSection title='Loading Settings'>
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <img alt="Loading..." src="/images/steam_spinner.png" style={{ width: '50%' }} />
                    </div>
                </PanelSection>) :
                <>
                    <PanelSection title='Home Page' >
                        <PanelSectionRow >
                            <Field
                                focusable={true}
                                description={
                                    <div style={{ wordBreak: 'break-all', marginTop: '-8px' }}>
                                        {settingsManager.settings.homeUrl || defaultUrl}
                                    </div>
                                }
                                onOptionsActionDescription={status.running ? 'Open in New Tab' : ''}
                                onOKActionDescription={status.running ? 'Open in Current Tab' : 'Open'}
                                onOKButton={() => openUrl(settingsManager.settings.homeUrl || defaultUrl)}
                                onOptionsButton={() => { openUrl(settingsManager.settings.homeUrl || defaultUrl, true) }}
                            />
                        </PanelSectionRow>
                    </PanelSection>
                    <PanelSection title="Default Tabs">
                        <PanelSectionRow style={{ marginLeft: '-16px', marginRight: '-16px' }}>
                            <ReorderableList<{ tab: string }>
                                entries={defaultTabItems}
                                onSave={(entries) => {
                                    settingsManager.setSetting('defaultTabs', entries.map((entry) => entry.data!.tab))
                                }}
                                onButtonPress={(evt: GamepadEvent, entry: ReorderableEntry<{ tab: string }>) => {
                                    const tab = entry.data!.tab
                                    switch (evt.detail.button) {
                                        case GamepadButton.SECONDARY:
                                            if (tab !== 'home') {
                                                const closeModal = () => { }
                                                showModal(<ConfirmDeleteDefaultTabModal index={entry.position} closeModal={closeModal} />)
                                            }
                                            break
                                        case GamepadButton.OK:
                                            openUrl(tab)
                                            break
                                        case GamepadButton.OPTIONS:
                                            openUrl(tab, true)
                                    }
                                }}
                                reorderButton={GamepadButton.START}
                                saveOrderOnOk={true}
                                fieldProps={{
                                    onSecondaryActionDescription: 'Delete',
                                    onOptionsActionDescription: status.running ? 'Open in New Tab' : '',
                                    onOKActionDescription: status.running ? 'Open in Current Tab' : 'Open'
                                }}
                            />
                        </PanelSectionRow>
                    </PanelSection>
                    <PanelSection title='Search Engine' >
                        <PanelSectionRow>
                            <DropdownItem
                                bottomSeparator={settingsManager.settings.searchEngine === SearchEngine.CUSTOM ? 'none' : 'standard'}
                                layout='below'
                                rgOptions={[
                                    { label: 'Google', data: SearchEngine.GOOGLE },
                                    { label: 'Bing', data: SearchEngine.BING },
                                    { label: 'Yahoo', data: SearchEngine.YAHOO },
                                    { label: 'Custom', data: SearchEngine.CUSTOM }
                                ]}
                                selectedOption={settingsManager.settings.searchEngine ?? SearchEngine.GOOGLE}
                                onChange={(option) => {
                                    settingsManager.setSetting('searchEngine', option.data)
                                }}
                            />
                        </PanelSectionRow>
                        {settingsManager.settings.searchEngine === SearchEngine.CUSTOM && <>
                            <PanelSectionRow>
                                <ButtonItem
                                    description={settingsManager.settings.customSearchUrl}
                                    onClick={() => showModal(<CustomSearchUrlModal value={settingsManager.settings.customSearchUrl ?? ''} onSave={url => settingsManager.setSetting('customSearchUrl', url)} />)}
                                    layout='below'
                                >
                                    Edit Custom Url
                                </ButtonItem>
                            </PanelSectionRow>
                        </>}
                    </PanelSection>
                    <PanelSection title='Tab Bar'>
                        <PanelSectionRow>
                            <ToggleField
                                label={<div style={{ display: 'flex', alignItems: 'baseline' }}>
                                    <div>
                                        Start Hidden
                                    </div>
                                    <div style={{ fontSize: '.7em', lineHeight: '.7em', marginLeft: '1ch' }}>
                                        requires reload
                                    </div>
                                </div>}
                                checked={!!settingsManager.settings.noTabBar}
                                onChange={checked => settingsManager.setSetting('noTabBar', checked)}
                            />
                        </PanelSectionRow>
                    </PanelSection>
                    <PanelSection title='Menu Position' >
                        <PanelSectionRow>
                            <Field label={
                                <div style={{ width: '100%' }}>
                                    <EnhancedSelector
                                        rgOptions={menuPositionOptions}
                                        onChange={option => {
                                            settingsManager.setSetting('menuPosition', option.data)
                                            setMenuPosition(option.data)
                                        }}
                                        selectedOption={selectedMenuPosition.data}
                                        fullWidth={true}
                                    />
                                </div>}
                            />
                        </PanelSectionRow>
                    </PanelSection>

                </>
            }
            <PanelSection title='other'>
                <PanelSectionRow>
                    <ButtonItem layout='below' onClick={() => openUrl('localhost:8080', true)}>
                        Open Inspector
                    </ButtonItem>
                </PanelSectionRow>
                <PanelSectionRow>
                    <ButtonItem
                        disabled={!isRunning}
                        layout='below'
                        onClick={() => killBrowser(() => setIsRunning(false))}
                    >
                        Kill Browser
                    </ButtonItem>
                </PanelSectionRow>
                <SocialButton icon={<SiGithub />} url='https://github.com/jessebofill/DeckWebBrowser#readme' minHeight='40px'>
                    Plugin GitHub
                </SocialButton>
                <SocialButton icon={<SiKofi />} url='https://ko-fi.com/jessebofill' minHeight='40px'>
                    Kofi
                </SocialButton>
            </PanelSection>
        </>
    );
};