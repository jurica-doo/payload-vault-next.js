import { UserIcon, CloseIcon } from "../icons";

interface ProfileDropdownProps {
  userEmail: string | undefined;
  onSignOut: () => void;
  onClose: () => void;
}

export const ProfileDropdown = ({
  userEmail,
  onSignOut,
  onClose,
}: ProfileDropdownProps) => {
  return (
    <div className="relative flex w-64 flex-col items-start justify-start rounded-md border border-color-border-light bg-color-bg-card px-4 py-4 shadow-shadow-strong animate-scale-in">
      <div className="flex w-full items-center justify-between border-bottom border-color-border-light pb-2 mb-3">
        <div className="flex items-center gap-2">
          <UserIcon className="h-5 w-5 text-color-text-subtle" />
          <span className="text-sm font-bold text-color-text-main uppercase tracking-wider">
            My Profile
          </span>
        </div>
        <button
          onClick={onClose}
          className="cursor-pointer text-color-text-subtle hover:text-color-text-main transition-all duration-200 ease-in-out"
        >
          <CloseIcon className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-col gap-1 w-full mb-6">
        <p className="text-[12px] text-color-text-subtle font-semibold uppercase">
          Email
        </p>
        <p className="truncate text-[14px] font-medium text-color-text-main">
          {userEmail}
        </p>
      </div>

      <button
        onClick={() => {
          onSignOut();
          onClose();
        }}
        className="w-full rounded-lg bg-color-error/10 py-2.5 text-center text-[14px] font-bold text-color-error-text hover:bg-color-error/20 transition-all duration-200 ease-in-out active:scale-95 border border-color-error-border/20"
      >
        Sign Out
      </button>
    </div>
  );
};
