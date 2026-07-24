import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Class to put on <DialogContent> so it becomes a flex column with
 * a bounded height. Combine with <DialogScrollBody> for a body that
 * scrolls while the header/footer stay pinned.
 */
export const dialogScrollContent = "flex max-h-[90vh] flex-col overflow-hidden";

/**
 * Scrollable body slot for cashier-style dialogs (refund, struk, closing, dst).
 * Wrap the middle content between <DialogHeader> and <DialogFooter>.
 */
export const DialogScrollBody = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-1", className)}
    {...props}
  />
));
DialogScrollBody.displayName = "DialogScrollBody";
