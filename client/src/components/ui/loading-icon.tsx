import React from "react";
import { cn } from "@/lib/utils";
import loadingGif from "@assets/Pause GIF image.gif";

interface LoadingIconProps {
  className?: string;
  size?: number;
}

export const LoadingIcon: React.FC<LoadingIconProps> = ({ className, size = 32 }) => {
  return (
    <div className={cn("flex items-center justify-center", className)}>
      <img
        src={loadingGif}
        alt="Loading..."
        style={{ width: size, height: size }}
        className="object-contain"
      />
    </div>
  );
};

export default LoadingIcon;
