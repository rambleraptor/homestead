# syntax=docker/dockerfile:1

# One-shot init container: captures the aepbase superuser password from
# the shared log volume, then runs `terraform apply` against the
# running aepbase to create every resource definition declared under
# aepbase/terraform/.
#
# The terraform/ directory is bind-mounted at /work in docker-compose
# so iterating on schema doesn't require rebuilding the image.
FROM hashicorp/terraform:1.7

RUN apk add --no-cache bash curl jq

WORKDIR /work
COPY entrypoint.sh /usr/local/bin/bootstrap-entrypoint.sh
RUN chmod +x /usr/local/bin/bootstrap-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/bootstrap-entrypoint.sh"]
