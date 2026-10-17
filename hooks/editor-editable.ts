import { createContext } from "react";

// React node views are portals: context updates them without recreating the editor.
export const EditorEditableContext = createContext(true);
