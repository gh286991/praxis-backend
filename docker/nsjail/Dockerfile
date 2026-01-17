FROM python:3.11-slim

# Install dependencies for building nsjail
RUN apt-get update && apt-get install -y \
    autoconf \
    bison \
    flex \
    gcc \
    g++ \
    git \
    libprotobuf-dev \
    libnl-route-3-dev \
    libtool \
    make \
    pkg-config \
    protobuf-compiler \
    && rm -rf /var/lib/apt/lists/*

# Clone and build nsjail
WORKDIR /tmp
RUN git clone https://github.com/google/nsjail.git
WORKDIR /tmp/nsjail
RUN make && mv nsjail /usr/local/bin/nsjail

# Cleanup build artifacts
WORKDIR /
RUN rm -rf /tmp/nsjail

# Create a directory for user code
WORKDIR /app

# Create temp directory for shared volume
RUN mkdir -p /app/temp

# Copy nsjail configuration
COPY nsjail.cfg /app/nsjail.cfg

# Ensure we have a non-root user for nsjail to switch to (though nsjail handles uids map)
# We usually want to run nsjail AS root (inside container) so it can set up namespaces,
# but it will switch to a low-privilege user for the actual process.
# Just creating a 'nobody' style user for reference if needed, but standard 'nobody' exists.

CMD ["/bin/bash"]
