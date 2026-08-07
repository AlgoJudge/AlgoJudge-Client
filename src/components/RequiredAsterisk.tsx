/**
 * The mark a required field carries, for a control that does not draw one.
 *
 * Mantine draws it from `Input.Wrapper`, which `Checkbox` is not built on — so
 * `required` on a checkbox sets the HTML attribute and nothing appears. Both
 * boxes somebody must tick before they may go on, registering and enrolling,
 * looked optional because of it.
 *
 * The same colour Mantine uses, so it is the mark people already recognise from
 * the fields above it rather than a second convention.
 */
export default function RequiredAsterisk() {
    return (
        <span aria-hidden style={{ color: "var(--mantine-color-error)" }}> *</span>
    );
}
