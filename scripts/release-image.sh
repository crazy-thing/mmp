#!/usr/bin/env bash
# Builds the MMP image for amd64 and arm64 and, with --push, publishes it to Docker Hub.
# This is the manual twin of .github/workflows/release.yml, for releasing from your own machine.
#
#   npm run release:image                  build both architectures, push nothing (a check)
#   npm run release:image -- --push        build and push crazything1/mmp:<version> (+ 5.0, 5, latest)
#   npm run release:image -- --push --latest
#                                          also move `latest` for a pre-release, e.g. while testing an alpha
#
# The version comes from apps/server/package.json. Push needs `docker login -u crazything1` first.
set -euo pipefail

IMAGE="${IMAGE:-crazything1/mmp}"
PLATFORMS="${PLATFORMS:-linux/amd64,linux/arm64}"
PUSH=false
FORCE_LATEST=false
for arg in "$@"; do
  case "$arg" in
    --push) PUSH=true ;;
    --latest) FORCE_LATEST=true ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

# Prints the Docker Hub account Docker is logged in as. Newer Docker Desktop versions keep it in
# the credential store instead of showing it in `docker info`.
docker_hub_user() {
  local user store
  user="$(docker info 2>/dev/null | sed -n 's/^ *Username: *//p')"
  if [[ -z "$user" ]]; then
    store="$(node -p "try { require(require('os').homedir() + '/.docker/config.json').credsStore || '' } catch { '' }" 2>/dev/null)"
    if [[ -n "$store" ]] && command -v "docker-credential-$store" >/dev/null; then
      user="$("docker-credential-$store" list 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const m=JSON.parse(s);process.stdout.write(m['https://index.docker.io/v1/']||'')}catch{}})")"
    fi
  fi
  [[ -n "$user" ]] && echo "$user"
}

cd "$(dirname "$0")/.."
VERSION="$(node -p "require('./apps/server/package.json').version")"
REVISION="$(git rev-parse --short HEAD 2>/dev/null || echo uncommitted)"

if ! docker info >/dev/null 2>&1; then
  echo "Docker isn't running. Start Docker Desktop and try again." >&2
  exit 1
fi

TAGS=("$IMAGE:$VERSION")
if [[ "$VERSION" != *-* ]]; then
  MAJOR="${VERSION%%.*}"
  MINOR="${VERSION#*.}"; MINOR="${MINOR%%.*}"
  TAGS+=("$IMAGE:$MAJOR.$MINOR" "$IMAGE:$MAJOR" "$IMAGE:latest")
elif $FORCE_LATEST; then
  TAGS+=("$IMAGE:latest")
fi

if $PUSH; then
  if [[ -n "$(git status --porcelain 2>/dev/null)" || "$REVISION" == uncommitted ]]; then
    echo "Warning: building from uncommitted changes. The image won't match any commit." >&2
  fi
  if ! docker_hub_user >/dev/null; then
    echo "Not logged in to Docker Hub. Run: docker login -u ${IMAGE%%/*}" >&2
    exit 1
  fi
fi

echo "Image:     $IMAGE"
echo "Version:   $VERSION (revision $REVISION)"
echo "Platforms: $PLATFORMS"
echo "Tags:      ${TAGS[*]#"$IMAGE:"}"
echo "Push:      $PUSH$($PUSH && echo " (as $(docker_hub_user))")"
echo

TAG_ARGS=()
for tag in "${TAGS[@]}"; do TAG_ARGS+=(--tag "$tag"); done

OUTPUT=()
if $PUSH; then OUTPUT=(--push); fi

docker buildx build \
  --platform "$PLATFORMS" \
  "${TAG_ARGS[@]}" \
  --label "org.opencontainers.image.title=MMP" \
  --label "org.opencontainers.image.description=Modpack Management Panel: modpack server, admin panel and file hosting" \
  --label "org.opencontainers.image.version=$VERSION" \
  --label "org.opencontainers.image.revision=$REVISION" \
  --label "org.opencontainers.image.source=https://github.com/crazy-thing/mmp" \
  ${OUTPUT[@]+"${OUTPUT[@]}"} \
  .

echo
if $PUSH; then
  echo "Published. On any computer with Docker:"
  echo "  docker pull $IMAGE:$VERSION"
  if [[ "$VERSION" == *-* ]] && ! $FORCE_LATEST; then
    echo "  (pre-release: set MMP_VERSION=$VERSION in .env, since it isn't tagged latest)"
  fi
else
  echo "Both architectures built. Nothing was pushed. Add --push to publish."
fi
