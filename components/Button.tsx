import * as React from "react";
import { PlasmicButton, DefaultButtonProps } from "./plasmic/afr/PlasmicButton";

import type {
  ButtonRef,
  HtmlAnchorOnlyProps,
  HtmlButtonOnlyProps,
} from "@plasmicapp/react-web";

export type ButtonProps = DefaultButtonProps;

function Button_(props: ButtonProps, ref: ButtonRef) {
  const { plasmicProps } = PlasmicButton.useBehavior<ButtonProps>(props, ref);
  return <PlasmicButton {...plasmicProps} />;
}

export type ButtonComponentType = {
  (
    props: Omit<ButtonProps, HtmlAnchorOnlyProps> & {
      ref?: React.Ref<HTMLButtonElement>;
    }
  ): React.ReactElement;
  (
    props: Omit<ButtonProps, HtmlButtonOnlyProps> & {
      ref?: React.Ref<HTMLAnchorElement>;
    }
  ): React.ReactElement;
};

const Button = React.forwardRef(Button_) as unknown as ButtonComponentType;

export default Object.assign(Button, { __plumeType: "button" });
