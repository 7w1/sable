import { Box, Text } from 'folds';
import * as css from './styles.css';

export function AuthFooter() {
  return (
    <Box className={css.AuthFooter} justifyContent="Center" gap="400" wrap="Wrap">
      <Text as="a" size="T300" href="https://app.sable.moe" target="_blank" rel="noreferrer">
        About
      </Text>
      <Text
        as="a"
        size="T300"
        href="https://github.com/7w1/sable/"
        target="_blank"
        rel="noreferrer"
      >
        v1.3.0
      </Text>
      <Text as="a" size="T300" href="https://twitter.com/cinnyapp" target="_blank" rel="noreferrer">
        Twitter
      </Text>
      <Text as="a" size="T300" href="https://matrix.org" target="_blank" rel="noreferrer">
        Powered by Matrix
      </Text>
    </Box>
  );
}
