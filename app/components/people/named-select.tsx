/**
 * A shadcn Select that posts with its form. Radix renders a hidden native
 * select when the trigger sits inside a <form>, so `name` is all it needs.
 * Radix forbids "" as an item value, so "nothing chosen" options use a
 * sentinel (like "any" or "none") that the server treats as empty.
 */
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { cn } from "~/lib/utils";

export type SelectOption = { value: string; label: string };

export function NamedSelect({
  id,
  name,
  options,
  defaultValue,
  placeholder,
  invalid,
  describedBy,
  required,
  className,
}: {
  id: string;
  name: string;
  options: SelectOption[];
  defaultValue?: string;
  placeholder?: string;
  invalid?: boolean;
  describedBy?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <Select name={name} defaultValue={defaultValue || undefined} required={required}>
      <SelectTrigger
        id={id}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={cn("h-10 w-full bg-canvas", className)}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position="popper" className="max-h-72">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
