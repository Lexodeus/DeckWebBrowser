import { FooterLegendProps, findModuleChild } from "decky-frontend-lib"
import { HTMLAttributes, InputHTMLAttributes, VFC } from "react"


export interface FocusableInputProps extends FooterLegendProps, InputHTMLAttributes<HTMLInputElement> {
    ref?: any
    focusable?: boolean
    noFocusRing?: boolean
    preferredFocus?: boolean
    strEnterKeyLabel?: string
    onFocusWithin?: Function
    onKeyboardShow?: Function
    onEnterKeyPress?: Function
    onKeyboardNavOut?: Function
    onKeyboardFullyVisible?: Function
    onTextEntered?: Function
}

// Steam exports a factory that wraps an element type (e.g. 'input') with gamepad focus and virtual keyboard support.
// Older clients inline the keyboard handling (BIsElementValidForInput); newer ones (SteamOS stable, Oct 2026) move it
// into a separate hook, leaving a plain function that returns a forwardRef using virtualKeyboardProps.
const isFocusableInputFactory = (fn: Function) => {
    const f = fn.toString();
    if (!f.includes('virtualKeyboardProps')) return false;
    return f.includes('BIsElementValidForInput') || (f.includes('forwardRef') && f.includes('refKeyboardHandle'));
}

export const FocusableInput: VFC<FocusableInputProps> = (findModuleChild((mod) => {
    if (typeof mod !== 'object') return undefined;
    for (let prop in mod) {
        if (typeof mod[prop] === 'function' && !mod[prop].$$typeof && isFocusableInputFactory(mod[prop])) return mod[prop];
    }
}))?.('input');