#!/usr/bin/env bash
# Builds review contact sheets from the stills render.js --stills wrote into <project>/out.
# Usage: bash contact_sheet.sh <project-dir>   -> <project>/out/contact-<w>x<h>.jpg (one per format)
set -eu
P="${1:-.}"; cd "$P/out"
for fmt in $(ls still-*.jpg 2>/dev/null | sed -E 's/still-([0-9]+x[0-9]+)-.*/\1/' | sort -u); do
  files=$(ls still-$fmt-*.jpg | sort -t- -k3 -g)
  n=$(echo "$files" | wc -l)
  w=${fmt%x*}; h=${fmt#*x}
  if [ "$w" -ge "$h" ]; then tw=640; else tw=300; fi
  inputs=""; filt=""; i=0
  for f in $files; do inputs="$inputs -i $f"; filt="$filt[$i]scale=$tw:-1[s$i];"; i=$((i+1)); done
  chain=""; for j in $(seq 0 $((n-1))); do chain="$chain[s$j]"; done
  cols=$([ "$w" -ge "$h" ] && echo 3 || echo $n)
  layout=""; for j in $(seq 0 $((n-1))); do
    x=$(( (j % cols) * tw )); th=$(( tw * h / w )); y=$(( (j / cols) * th ))
    layout="$layout${layout:+|}${x}_${y}"; done
  ffmpeg -loglevel error -y $inputs -filter_complex "${filt}${chain}xstack=inputs=$n:layout=$layout:fill=black" "contact-$fmt.jpg"
  echo "contact-$fmt.jpg"
done
