import {
    Accordion, Alert, AppShell, Badge, Burger, Card, Checkbox, Chip, CloseButton, Combobox,
    createTheme, JsonInput, Loader, Modal, MultiSelect, Notification, NumberInput, Paper, PasswordInput,
    ScrollArea, SegmentedControl, Select, TagsInput, Textarea, TextInput,
    Switch,
} from "@mantine/core";
import { Notifications } from "@mantine/notifications";

/**
 * Stable handles for the browser checks, and nothing else.
 *
 * **No visual token is set here.** Every entry is a `data-testid`, so the theme
 * changes what the scripts can address and not what anybody sees. Colours and
 * radii stay Mantine's defaults, which is what the screens were reviewed
 * against.
 *
 * ## Why a theme rather than attributes on the components
 *
 * The scripts scoped by Mantine's **generated** class names — `[class*=
 * Modal-content]` and twenty-nine other patterns, 208 places — which is a
 * selector that reddens on a library upgrade with nothing broken. Two of those
 * three patterns could not be fixed by putting an attribute on the element
 * either: `Modal` has no `contentProps`, so an attribute on `<Modal>` lands on
 * the root rather than the panel, and `Switch` spreads to its `input` rather
 * than to the wrapper the scripts scope by.
 *
 * `attributes` answers both, because it addresses a **styles name** directly.
 * The mechanism, read in `@mantine/core` rather than assumed: `useProps` merges
 * `theme.components[X].defaultProps` into a component's props, and `useStyles`
 * spreads `attributes?.[selector]` onto the element of each styles name. It
 * arrived in Mantine 8, which is one reason the dependency sweep ran first.
 *
 * ## What is deliberately not here
 *
 * A per-instance id. These are **containers to scope by**, so every modal
 * carries the same `modal` and every card the same `card` — which is exactly
 * what the class selectors gave, and enough, because one modal is open at a
 * time. A control that has to be told apart from its neighbours gets an
 * attribute where it is written, not here.
 *
 * `Card` is worth one note: it renders a `Paper`, and passes its own resolved
 * root props through. Paper spreads its own `getStyles("root")` first and the
 * incoming props after, so a Card reads `card` and a plain Paper reads `paper`.
 */
const testid = (id: string) => ({ "data-testid": id });

export const theme = createTheme({
    components: {
        // The three shell slots. `AppShell.Main` and its siblings draw their
        // styles from the AppShell context, so naming the slots here reaches
        // them — they do not need touching where the layout is written.
        AppShell: AppShell.extend({
            defaultProps: {
                attributes: {
                    main: testid("app-main"),
                    navbar: testid("app-navbar"),
                    header: testid("app-header"),
                },
            },
        }),

        Modal: Modal.extend({
            defaultProps: { attributes: { content: testid("modal"), close: testid("modal-close") } },
        }),

        Card: Card.extend({ defaultProps: { attributes: { root: testid("card") } } }),
        Paper: Paper.extend({ defaultProps: { attributes: { root: testid("paper") } } }),

        Accordion: Accordion.extend({
            defaultProps: {
                attributes: { item: testid("accordion-item"), control: testid("accordion-control") },
            },
        }),

        // The wrapper, not the `input` the component spreads to.
        Switch: Switch.extend({ defaultProps: { attributes: { root: testid("switch") } } }),
        Checkbox: Checkbox.extend({ defaultProps: { attributes: { root: testid("checkbox") } } }),

        SegmentedControl: SegmentedControl.extend({
            defaultProps: { attributes: { root: testid("segmented") } },
        }),
        /*
         * **The field wrapper, through `wrapperProps` rather than `attributes`.**
         *
         * Eight checks want "the field whose label says X", which is the
         * `Input.Wrapper` root every input renders. `attributes` cannot express
         * that: a compound input **forwards whatever `attributes` it resolves to
         * the parts it renders**, and each part applies them by its *own* styles
         * names — so a `root` key means "the input's root" to the wrapper and
         * "the pill's root" to a `TagsInput`'s pills, and lands on both.
         *
         * Measured three times before it was understood. An entry for the shared
         * `InputWrapper` put its ids on the pills; naming the concrete inputs
         * moved the leak rather than fixing it; and naming only `pill` on
         * `TagsInput` took `field` off its own wrapper, because an `attributes`
         * entry **replaces** the inherited one wholesale instead of merging.
         *
         * `wrapperProps` is a plain prop bag for the wrapper alone, so it reaches
         * the one element wanted and nothing inside it. The cost is one line per
         * input type.
         */
        TextInput: TextInput.extend({ defaultProps: { wrapperProps: testid("field") } }),
        Textarea: Textarea.extend({ defaultProps: { wrapperProps: testid("field") } }),
        // The three opaque documents on an assignment are these, and they were
        // the one input a check could not address by id.
        JsonInput: JsonInput.extend({ defaultProps: { wrapperProps: testid("field") } }),
        PasswordInput: PasswordInput.extend({ defaultProps: { wrapperProps: testid("field") } }),
        NumberInput: NumberInput.extend({ defaultProps: { wrapperProps: testid("field") } }),
        Select: Select.extend({ defaultProps: { wrapperProps: testid("field") } }),
        MultiSelect: MultiSelect.extend({ defaultProps: { wrapperProps: testid("field") } }),
        // No `attributes` here: `pill` never reaches the element on this version
        // — measured — so the one check that reads tag pills keeps a class
        // selector, and says so.
        TagsInput: TagsInput.extend({ defaultProps: { wrapperProps: testid("field") } }),

        /*
         * **No input component is themed here, and that is a finding rather than
         * an omission.**
         *
         * `attributes` given to a composite input propagate to the parts it
         * renders. An entry for the shared `InputWrapper` put its ids on the
         * *pills* of a `TagsInput`; naming the concrete inputs instead —
         * `TagsInput`, `TextInput` and the rest — moved the leak rather than
         * fixing it, putting `field` on `mantine-Pill-root`. Both were measured
         * in the browser, and three checks went red on the first.
         *
         * So the eight places that scope by a field keep `[class*=InputWrapper-
         * root]`. They are the only generated-class selectors left that are not
         * deliberate.
         */
        Combobox: Combobox.extend({
            defaultProps: { attributes: { option: testid("combobox-option") } },
        }),

        ScrollArea: ScrollArea.extend({
            defaultProps: { attributes: { viewport: testid("scroll-viewport") } },
        }),
        // `Table.ScrollContainer` is a component in its own right, with its own
        // theme name — not a styles name of `Table`.
        TableScrollContainer: {
            defaultProps: { attributes: { scrollContainer: testid("table-scroll") } },
        },

        Notification: Notification.extend({
            defaultProps: { attributes: { root: testid("notification") } },
        }),
        Notifications: Notifications.extend({
            defaultProps: { attributes: { root: testid("notifications") } },
        }),

        Badge: Badge.extend({
            defaultProps: { attributes: { root: testid("badge"), label: testid("badge-label") } },
        }),
        Chip: Chip.extend({ defaultProps: { attributes: { label: testid("chip-label") } } }),
        Alert: Alert.extend({ defaultProps: { attributes: { root: testid("alert") } } }),
        Loader: Loader.extend({ defaultProps: { attributes: { root: testid("loader") } } }),
        CloseButton: CloseButton.extend({
            defaultProps: { attributes: { root: testid("close-button") } },
        }),
        Burger: Burger.extend({ defaultProps: { attributes: { root: testid("burger") } } }),
    },
});
