#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p build
extra=()
if [[ "${AURALIS_X11:-0}" == 1 ]]; then
  extra+=(-DAURALIS_X11 -l:libX11.so.6)
  if [[ -n "${AURALIS_X11_INCLUDE:-}" ]]; then extra+=(-I"$AURALIS_X11_INCLUDE"); fi
fi
c++ -std=c++17 -O2 -Wall -Wextra -Ivendor/clap/include clap-host.cpp "${extra[@]}" -ldl -o build/auralis-clap
c++ -std=c++17 -O2 -Wall -Wextra -Ivendor/vst3 vst3-host.cpp "${extra[@]}" vendor/vst3/pluginterfaces/base/funknown.cpp -ldl -o build/auralis-vst3
c++ -std=c++17 -O2 -fPIC -shared -Ivendor/clap/include tests/gain-clap.cpp "${extra[@]}" -o build/gain-fixture.clap
c++ -std=c++17 -O2 -fPIC -shared -Ivendor/vst3 tests/gain-vst3.cpp "${extra[@]}" vendor/vst3/pluginterfaces/base/funknown.cpp -o build/gain-fixture.so
