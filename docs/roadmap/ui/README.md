# UI Roadmap

Last updated: 2026-06-14

## Navigation Rules

- Organization list page: show organization dropdown only.
- Organization detail / chatbot overview page: show organization dropdown only.
- Selected chatbot page: show both organization and chatbot dropdowns.
- Dropdown changes update local storage:
  - `hamba.workspace.selectedOrganizationId`
  - `hamba.workspace.selectedPropertyId`
- Route params remain the source of truth when present.

## Chatbot Workspace Layout

- Reinstate top nav inside the selected chatbot workspace.
- Reduce side-panel widths on tablet-sized viewports.
- Auto-collapse the right settings panel on narrower screens so the chat pane remains usable.
- Keep collapsed settings and thread panels accessible with expand buttons.

## Settings Access

- Add Retrieval as a common side settings tab alongside Instructions and Model settings.
- Add the same retrieval settings surface to the full Settings page from the left sidebar.
- Retrieval settings are currently a UI surface for planned functionality; backend persistence belongs to the vector embeddings phase.

## Upcoming UI Work

- Move organization delete into the edit organization modal with a custom danger confirmation.
- Adopt HeroUI across visible workspace inputs and components — see [HeroUI adoption](./heroui.md).
- Apply the [forms enhancement protocol](./forms.md) to every form (validation, typed inputs, upload progress, accessibility, multi-step wizards).
- Add a Knowledge Base **Photos** tab with a HeroUI gallery — see [KB photos](../functionality/knowledge-base-photos.md).
- Surface structured property/unit details (image, address, price, occupants, ensuite, features) in the property and chatbot screens — see [property details](../functionality/property-details.md).
- Review tablet and mobile screenshots after the retrieval panel is added.
