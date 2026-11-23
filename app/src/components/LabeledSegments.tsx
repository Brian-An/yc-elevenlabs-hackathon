import SegmentedControl, { type SegmentedControlProps } from "@/components/arc/segmented-control/segmented-control";

/** A segmented control with a visible label, styled like the form fields' labels. */
export function LabeledSegments({ label, ...props }: SegmentedControlProps & { label: string }) {
  return (
    <div className="grid gap-2">
      <span aria-hidden="true" className="text-sm font-medium text-foreground">{label}</span>
      <SegmentedControl {...props} label={label} fullWidth />
    </div>
  );
}
