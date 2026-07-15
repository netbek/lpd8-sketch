{
  pkgs,
  lib,
  config,
  inputs,
  ...
}:
{
  env.DEVENV_TASKS_QUIET = 1;

  languages = {
    javascript = {
      enable = true;
      package = pkgs.nodejs_24;
      pnpm = {
        enable = true;
        package = pkgs.pnpm_10;
        install = {
          enable = true;
        };
      };
    };
  };

  dotenv = {
    disableHint = true;
  };
}
