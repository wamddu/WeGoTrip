package com.travel.travelbackend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "`user`")
@Getter
@NoArgsConstructor
public class User {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(nullable = false, length = 50)
    private String name;
    @Column(nullable = false, unique = true, length = 255)
    private String email;
    @Column(name = "password", length = 255)
    private String passwordHash;
    @Column(nullable = false, length = 20)
    private String role = "USER";
    @Column(nullable = false, length = 20)
    private String status = "ACTIVE";
    @Column(nullable = false, length = 20)
    private String loginProvider = "LOCAL";
    @Column(length = 512)
    private String bankAccountEncrypted;
    @Column(nullable = false)
    private long tokenVersion;
    @Column(nullable = false)
    private Instant createdAt;
    @Column(nullable = false)
    private Instant updatedAt;

    public User(String name, String email, String passwordHash, Instant now) {
        this.name = name; this.email = email; this.passwordHash = passwordHash;
        this.createdAt = now; this.updatedAt = now;
    }
    public void rename(String name, Instant now) { this.name = name; this.updatedAt = now; }
    public void revokeSessions() { this.tokenVersion++; }
    public void bank(String encrypted, Instant now) { this.bankAccountEncrypted = encrypted; this.updatedAt = now; }
    public void changePassword(String hash, Instant now) {
        this.passwordHash = hash; this.tokenVersion++; this.updatedAt = now;
    }
    public void withdraw(String replacementPasswordHash, Instant now) {
        status = "DELETED"; passwordHash = replacementPasswordHash; bankAccountEncrypted = null;
        email = "DELETED_" + UUID.randomUUID().toString().replace("-", "");
        name = "DELETED_" + UUID.randomUUID().toString().replace("-", "");
        tokenVersion++; updatedAt = now;
    }
}
