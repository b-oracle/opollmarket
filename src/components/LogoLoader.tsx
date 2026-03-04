import { motion } from "framer-motion";

interface LogoLoaderProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeMap = {
  sm: "w-5 h-5",
  md: "w-10 h-10",
  lg: "w-14 h-14",
};

const LogoLoader = ({ size = "md", className = "" }: LogoLoaderProps) => {
  return (
    <motion.img
      src="/logo.png"
      alt="Loading"
      className={`${sizeMap[size]} ${className}`}
      animate={{
        rotate: 360,
        scale: [1, 1.1, 1],
      }}
      transition={{
        rotate: { repeat: Infinity, duration: 1.5, ease: "linear" },
        scale: { repeat: Infinity, duration: 1.5, ease: "easeInOut" },
      }}
    />
  );
};

export default LogoLoader;
