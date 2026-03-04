import { CSSProperties, ReactNode } from 'react';
import { Box, Badge, toRem, Text } from 'folds';

type UnreadBadgeProps = {
  highlight?: boolean;
  count: number;
};
const styles: CSSProperties = {
  minWidth: toRem(16),
};
export function UnreadBadgeCenter({ children }: { children: ReactNode }) {
  return (
    <Box as="span" style={styles} shrink="No" alignItems="Center" justifyContent="Center">
      {children}
    </Box>
  );
}

export function UnreadBadge({ highlight, count }: UnreadBadgeProps) {
  const badgeText = count > 9 ? '9+' : `${count}`;

  return (
    <Badge
      variant={highlight ? 'Success' : 'Secondary'}
      size={count > 0 ? '400' : '200'}
      fill="Solid"
      radii="Pill"
      outlined={false}
    >
      {count > 0 && (
        <Text as="span" size="L400">
          {badgeText}
        </Text>
      )}
    </Badge>
  );
}
