import Link from "next/link";
import Image from "next/image";
import { DEFAULT_IMG } from "@/services/class/helpers/class-helpers";
import IconButton from "../ui/buttons/IconButton";

export default function AddClassCard({
  href = "/classes/create",
}: {
  href?: string;
}) {
  return (
    <Link
      href={href}
      className="
        group relative flex h-[220px] items-center justify-center
        overflow-hidden rounded-2xl
        ring-1 ring-black/5 shadow-lg
        transition-transform hover:-translate-y-[5px]
      "
    >
      <Image
        src={DEFAULT_IMG}
        alt={`Add new class`}
        fill
        priority={false}
        className="object-cover blur-xs scale-110"
      />

      <IconButton
        icon="mingcute:add-line"
        variant="normal"
        size="xl"
        className="absolute"
      />
    </Link>
  );
}
