package com.travel.travelbackend.entity;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import java.time.Instant;
@Entity @Table(name = "auth_refresh_credential") @Getter @NoArgsConstructor
public class RefreshCredential {
    @Id @Column(length = 64) private String digest;
    @Column(nullable = false) private Long userId;
    @Column(nullable = false) private long tokenVersion;
    @Column(nullable = false) private Instant authenticatedAt;
    @Column(nullable = false) private Instant expiresAt;
    @Column(nullable = false) private boolean consumed;
    public RefreshCredential(String digest, Long userId, long version, Instant authenticatedAt, Instant expiresAt) {
        this.digest = digest; this.userId = userId; this.tokenVersion = version;
        this.authenticatedAt = authenticatedAt; this.expiresAt = expiresAt;
    }
    public void consume() { consumed = true; }
}
