import { as } from 'folds';
import classNames from 'classnames';
import * as css from './style.css';

type PowerColorBadgeProps = {
  color?: string;
};
export const PowerColorBadge = as<'span', PowerColorBadgeProps>(
  ({ as: AsPowerColorBadge = 'span', color, className, style, ...props }, ref) => (
    <AsPowerColorBadge
      className={classNames(css.PowerColorBadge, { [css.PowerColorBadgeNone]: !color }, className)}
      style={{
        backgroundColor: color,
        ...style,
      }}
      {...props}
      ref={ref}
    />
  )
);
