import { useEffect } from 'react';

/**
 * A custom hook that listens for global paste events.
 * It ignores paste events if the user is currently focused inside an input, textarea, or content-editable element.
 *
 * @param onPaste Callback function triggered with the pasted text
 */
export function useGlobalPaste(onPaste: (text: string) => void) {
  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      // Check the currently focused element
      const activeElement = document.activeElement as HTMLElement | null;

      if (activeElement) {
        const tagName = activeElement.tagName.toLowerCase();
        const isInput = tagName === 'input';
        const isTextarea = tagName === 'textarea';
        const isContentEditable = activeElement.isContentEditable;

        // If focused on an input field, textarea, or content-editable element, do not intercept
        if (isInput || isTextarea || isContentEditable) {
          return;
        }
      }

      const clipboardData = event.clipboardData;
      if (!clipboardData) return;

      const pastedText = clipboardData.getData('text');

      if (pastedText && pastedText.trim() !== '') {
        // Prevent default behavior to avoid any unintended side effects
        event.preventDefault();
        onPaste(pastedText);
      }
    };

    // Attach the event listener to the document
    document.addEventListener('paste', handlePaste);

    // Cleanup listener on unmount
    return () => {
      document.removeEventListener('paste', handlePaste);
    };
  }, [onPaste]);
}
