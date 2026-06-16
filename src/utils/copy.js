/**
 * Robustly copies text to the clipboard.
 * Uses navigator.clipboard if available and secure, otherwise falls back to document.execCommand.
 * @param {string} text - The text to copy.
 * @returns {Promise<boolean>} - Resolves to true if the copy succeeded, false otherwise.
 */
export const copyToClipboard = async (text) => {
    // Try modern Clipboard API first (requires secure context)
    if (navigator.clipboard) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            console.warn('navigator.clipboard.writeText failed, attempting fallback copy:', err);
        }
    }

    // Fallback approach using a temporary textarea
    const textArea = document.createElement("textarea");
    textArea.value = text;
    
    // Keep it off-screen and static
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.width = '2em';
    textArea.style.height = '2em';
    textArea.style.padding = '0';
    textArea.style.border = 'none';
    textArea.style.outline = 'none';
    textArea.style.boxShadow = 'none';
    textArea.style.background = 'transparent';
    textArea.style.opacity = '0';

    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    let success = false;
    try {
        success = document.execCommand('copy');
    } catch (err) {
        console.error('Fallback copy operation failed:', err);
    }

    document.body.removeChild(textArea);
    return success;
};
