import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive:
          'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80',
        outline: 'text-foreground',
        /* Lime Zest (#D7F77D) for warnings — official Sisense secondary colour */
        warning: 'border-transparent bg-[hsl(76,88%,88%)] text-[hsl(76,60%,28%)] dark:bg-[hsl(76,60%,20%)] dark:text-[hsl(76,88%,73%)]',
        /* Seabyte (#94F5F0) tint for success */
        success: 'border-transparent bg-[hsl(177,83%,88%)] text-[hsl(177,60%,24%)] dark:bg-[hsl(177,50%,18%)] dark:text-[hsl(177,83%,70%)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
