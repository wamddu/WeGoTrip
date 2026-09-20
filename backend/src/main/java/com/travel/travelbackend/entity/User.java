package com.travel.travelbackend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import java.time.Instant;

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
    public void withdraw(Instant now) {
        status = "WITHDRAWN"; passwordHash = null; bankAccountEncrypted = null;
        name = "탈퇴한 사용자"; tokenVersion++; updatedAt = now;
    }
}
