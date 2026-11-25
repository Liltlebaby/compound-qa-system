export default function CompanyLogo({ className = '' }: { className?: string }) {
  return (
    <img
      className={'company-logo ' + className}
      src="/brand/von-bundit-logo.png"
      alt="VON BUNDIT"
      width={1972}
      height={1907}
      decoding="async"
    />
  );
}
