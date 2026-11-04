
import { Collapsible as CollapsiblePrimitive } from "radix-ui"
import { cn } from "@rambleraptor/homestead-core/shared/lib/utils"

function Collapsible({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Root>) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />
}

function CollapsibleTrigger({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleTrigger>) {
  return (
    <CollapsiblePrimitive.CollapsibleTrigger
      data-slot="collapsible-trigger"
      {...props}
    />
  )
}

function CollapsibleContent({
  className,
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleContent>) {
  return (
    <CollapsiblePrimitive.CollapsibleContent
      data-slot="collapsible-content"
      // Opens and closes on its measured height (`animate-collapse-*` in
      // globals.css), like shadcn's Accordion; Radix keeps a closing panel
      // mounted until the animation ends. `overflow-hidden` is what makes a
      // height animation read as a reveal rather than a clip.
      className={cn(
        "overflow-hidden data-[state=open]:animate-collapse-open data-[state=closed]:animate-collapse-close",
        className
      )}
      {...props}
    />
  )
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
